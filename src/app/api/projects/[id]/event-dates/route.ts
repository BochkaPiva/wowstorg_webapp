import { ProjectActivityKind } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Укажите существующую дату");
const schema = z.object({
  eventStartDate: day,
  eventEndDate: day,
  expectedStartDate: day.nullable(),
  expectedEndDate: day.nullable(),
}).strict().refine(value => value.eventEndDate >= value.eventStartDate, "Окончание не может быть раньше начала");
const ymd = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

/** Narrow, audited exception to archive read-only: correct dates, never reopen work. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError(400, "Invalid id");
  let body: unknown;
  try { body = await req.json(); } catch { return jsonError(400, "Invalid JSON body"); }
  const input = schema.safeParse(body);
  if (!input.success) return jsonError(400, "Проверьте даты мероприятия", input.error.flatten());
  const dates = input.data;
  try {
    await prisma.$transaction(async tx => {
      const project = await tx.project.findUnique({ where: { id }, select: { status: true, eventStartDate: true, eventEndDate: true, eventDateConfirmed: true } });
      if (!project) throw new Error("NOT_FOUND");
      if (project.status !== "COMPLETED") throw new Error("NOT_COMPLETED");
      if (ymd(project.eventStartDate) !== dates.expectedStartDate || ymd(project.eventEndDate) !== dates.expectedEndDate) throw new Error("STALE_DATES");
      if (ymd(project.eventStartDate) === dates.eventStartDate && ymd(project.eventEndDate) === dates.eventEndDate && project.eventDateConfirmed) return;
      const result = await tx.project.updateMany({
        where: { id, status: "COMPLETED", eventStartDate: project.eventStartDate, eventEndDate: project.eventEndDate },
        data: { eventStartDate: new Date(`${dates.eventStartDate}T00:00:00Z`), eventEndDate: new Date(`${dates.eventEndDate}T00:00:00Z`), eventDateConfirmed: true },
      });
      if (result.count !== 1) throw new Error("STALE_DATES");
      await appendProjectActivityLog(tx, {
        projectId: id, actorUserId: auth.user.id, kind: ProjectActivityKind.PROJECT_UPDATED,
        payload: { source: "ANALYTICS_DATE_CORRECTION", changes: {
          eventStartDate: { from: ymd(project.eventStartDate), to: dates.eventStartDate },
          eventEndDate: { from: ymd(project.eventEndDate), to: dates.eventEndDate },
          eventDateConfirmed: { from: project.eventDateConfirmed, to: true },
        } },
      });
    });
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") return jsonError(404, "Проект не найден");
      if (error.message === "NOT_COMPLETED") return jsonError(409, "Даты активного проекта меняются в его карточке");
      if (error.message === "STALE_DATES") return jsonError(409, "Даты уже изменились. Обновите аналитику и повторите.");
    }
    throw error;
  }
}
