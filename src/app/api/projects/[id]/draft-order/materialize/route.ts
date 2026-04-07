import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import {
  materializeProjectDraftOrder,
  ProjectDraftOrderError,
} from "@/server/projects/draft-order";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PeriodSchema = z
  .object({
    key: z.string().trim().min(1).max(120),
    title: z.string().trim().max(300).nullable().optional(),
    readyByDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lineIds: z.array(z.string().trim().min(1)).min(1).max(1000),
  })
  .strict();

const BodySchema = z
  .object({
    periods: z.array(PeriodSchema).min(1).max(50),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  try {
    const result = await materializeProjectDraftOrder({
      projectId,
      actorUserId: auth.user.id,
      periods: parsed.data.periods,
    });

    scheduleAfterResponse("notifyProjectDraftMaterialized", async () => {
      const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
      await notifyProjectNoisyBlock({
        projectId,
        actorUserId: auth.user.id,
        block: "estimate",
        action:
          result.remainingDraftLines > 0
            ? `Demo-черновик частично материализован в реальные заявки (${result.createdOrders.length} шт.).`
            : `Demo-черновик полностью материализован в реальные заявки (${result.createdOrders.length} шт.).`,
      });
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Конфликт при резервировании. Повторите попытку.");
    }
    if (error instanceof ProjectDraftOrderError) {
      if (error.code === "PROJECT_NOT_FOUND") return jsonError(404, "Проект не найден");
      if (error.code === "DRAFT_NOT_FOUND") return jsonError(404, "Demo-черновик не найден");
      if (error.code === "DRAFT_EMPTY") return jsonError(400, "В demo-черновике нет позиций");
      if (error.code === "PERIODS_REQUIRED") return jsonError(400, "Укажите хотя бы один период");
      if (error.code === "PERIOD_KEY_REQUIRED") return jsonError(400, "У каждого периода должен быть ключ");
      if (error.code === "PERIOD_LINES_REQUIRED") return jsonError(400, "У периода нет назначенных строк");
      if (error.code === "LINE_ASSIGNED_TWICE") return jsonError(400, "Одна и та же строка назначена в несколько периодов");
      if (error.code === "LINES_NOT_ASSIGNED") return jsonError(400, "Не все строки demo-черновика распределены по периодам", error.details);
      if (error.code === "LINE_NOT_FOUND") return jsonError(400, "Одна из строк demo-черновика не найдена");
      if (error.code === "NOTHING_MATERIALIZED") {
        return jsonError(400, "Не удалось создать ни одной реальной заявки: по всем строкам сейчас нет доступности", error.details);
      }
      return jsonError(400, "Не удалось материализовать demo-черновик", error.details);
    }
    throw error;
  }
}
