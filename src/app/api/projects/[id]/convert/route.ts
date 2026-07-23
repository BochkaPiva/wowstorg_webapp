import { Prisma, ProjectActivityKind, ProjectBall, ProjectMode, ProjectStatus } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

const ConvertSchema = z
  .object({
    customerId: z.string().trim().min(1).optional(),
    customerName: z.string().trim().min(2).max(200).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.customerId || value.customerName), {
    message: "Укажите заказчика",
  });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  try {
    const project = await prisma.$transaction(
      async (tx) => {
        const before = await tx.project.findUnique({
          where: { id },
          select: {
            id: true,
            mode: true,
            archivedAt: true,
            leadCustomerName: true,
          },
        });
        if (!before) throw new Error("NOT_FOUND");
        if (before.archivedAt) throw new Error("ARCHIVED");
        if (before.mode !== ProjectMode.ESTIMATE_ONLY) throw new Error("NOT_ESTIMATE_ONLY");

        let customerId = parsed.data.customerId?.trim() || "";
        if (customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
          });
          if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
        } else {
          const name = parsed.data.customerName!.trim();
          const existing = await tx.customer.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
            select: { id: true },
          });
          customerId = existing?.id
            ?? (
              await tx.customer.create({
                data: { name },
                select: { id: true },
              })
            ).id;
        }

        const updated = await tx.project.update({
          where: { id },
          data: {
            mode: ProjectMode.FULL,
            customerId,
            leadCustomerName: null,
            status: ProjectStatus.LEAD,
            ball: ProjectBall.CLIENT,
          },
          select: {
            id: true,
            title: true,
            mode: true,
            status: true,
            ball: true,
            customer: { select: { id: true, name: true } },
          },
        });

        await appendProjectActivityLog(tx, {
          projectId: id,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_CONVERTED,
          payload: {
            fromMode: ProjectMode.ESTIMATE_ONLY,
            toMode: ProjectMode.FULL,
            leadCustomerName: before.leadCustomerName,
            customerId,
          } as Prisma.InputJsonValue,
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return jsonOk({ project });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return jsonError(404, "Расчёт не найден");
    if (error instanceof Error && error.message === "ARCHIVED") return jsonError(400, "Архивный расчёт нельзя преобразовать");
    if (error instanceof Error && error.message === "NOT_ESTIMATE_ONLY") {
      return jsonError(400, "Это уже полноценный проект");
    }
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
      return jsonError(400, "Заказчик не найден");
    }
    throw error;
  }
}
