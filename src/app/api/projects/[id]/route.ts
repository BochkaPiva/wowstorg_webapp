import { type Prisma, ProjectActivityKind, ProjectBall, ProjectStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    ball: z.nativeEnum(ProjectBall).optional(),
    eventStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    eventEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    eventDateNote: z.string().trim().max(2000).optional().nullable(),
    eventDateConfirmed: z.boolean().optional(),
    openBlockers: z.string().trim().max(5000).optional().nullable(),
    internalSummary: z.string().trim().max(5000).optional().nullable(),
    archive: z.boolean().optional(),
  })
  .strict();

function parseDateOnly(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError(400, "Invalid id");

  const includeOrders = new URL(req.url).searchParams.get("includeOrders") === "1";
  const includeActivity = new URL(req.url).searchParams.get("includeActivity") === "1";

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      ball: true,
      archivedAt: true,
      eventStartDate: true,
      eventEndDate: true,
      eventDateNote: true,
      eventDateConfirmed: true,
      openBlockers: true,
      internalSummary: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { id: true, name: true } },
      owner: { select: { id: true, displayName: true } },
      _count: { select: { orders: true } },
      ...(includeOrders
        ? {
            orders: {
              orderBy: { createdAt: "desc" as const },
              take: 100,
              select: {
                id: true,
                status: true,
                source: true,
                readyByDate: true,
                startDate: true,
                endDate: true,
                eventName: true,
                createdAt: true,
              },
            },
          }
        : {}),
      ...(includeActivity
        ? {
            activityLogs: {
              orderBy: { createdAt: "desc" as const },
              take: 200,
              select: {
                id: true,
                kind: true,
                payload: true,
                createdAt: true,
                actor: { select: { displayName: true } },
              },
            },
          }
        : {}),
    },
  });

  if (!project) return jsonError(404, "Проект не найден");
  return jsonOk({
    project: {
      ...project,
      eventStartDate: toDateOnly(project.eventStartDate),
      eventEndDate: toDateOnly(project.eventEndDate),
    },
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError(400, "Invalid id");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const { archive, ...rest } = parsed.data;
  if (Object.keys(parsed.data).length === 0) {
    return jsonError(400, "Нет полей для обновления");
  }

  const data: {
    title?: string;
    status?: ProjectStatus;
    ball?: ProjectBall;
    eventStartDate?: Date | null;
    eventEndDate?: Date | null;
    eventDateNote?: string | null;
    eventDateConfirmed?: boolean;
    openBlockers?: string | null;
    internalSummary?: string | null;
    archivedAt?: Date;
  } = {};

  if (rest.title !== undefined) data.title = rest.title;
  if (rest.status !== undefined) data.status = rest.status;
  if (rest.ball !== undefined) data.ball = rest.ball;
  if (rest.eventStartDate !== undefined) data.eventStartDate = parseDateOnly(rest.eventStartDate);
  if (rest.eventEndDate !== undefined) data.eventEndDate = parseDateOnly(rest.eventEndDate);
  if (rest.eventDateNote !== undefined) data.eventDateNote = rest.eventDateNote;
  if (rest.eventDateConfirmed !== undefined) data.eventDateConfirmed = rest.eventDateConfirmed;
  if (rest.openBlockers !== undefined) data.openBlockers = rest.openBlockers;
  if (rest.internalSummary !== undefined) data.internalSummary = rest.internalSummary;
  if (archive === true) data.archivedAt = new Date();

  const effectiveStart = data.eventStartDate !== undefined ? data.eventStartDate : undefined;
  const effectiveEnd = data.eventEndDate !== undefined ? data.eventEndDate : undefined;
  if (effectiveStart instanceof Date && effectiveEnd instanceof Date && effectiveEnd < effectiveStart) {
    return jsonError(400, "Дата окончания не может быть раньше даты начала");
  }

  if (Object.keys(data).length === 0) {
    return jsonError(400, "Нет полей для обновления");
  }

  const selectOut = {
    id: true,
    title: true,
    status: true,
    ball: true,
    archivedAt: true,
    eventStartDate: true,
    eventEndDate: true,
    eventDateNote: true,
    eventDateConfirmed: true,
    openBlockers: true,
    internalSummary: true,
    createdAt: true,
    updatedAt: true,
    customer: { select: { id: true, name: true } },
    owner: { select: { id: true, displayName: true } },
    _count: { select: { orders: true } },
  } as const;

  try {
    const project = await prisma.$transaction(async (tx) => {
      const before = await tx.project.findUnique({
        where: { id },
        select: {
          archivedAt: true,
          title: true,
          status: true,
          ball: true,
          eventStartDate: true,
          eventEndDate: true,
          eventDateNote: true,
          eventDateConfirmed: true,
          openBlockers: true,
          internalSummary: true,
        },
      });
      if (!before) {
        throw new Error("NOT_FOUND");
      }
      if (before.archivedAt != null) {
        throw new Error("ARCHIVED");
      }

      const fieldKeys = [
        "title",
        "status",
        "ball",
        "eventStartDate",
        "eventEndDate",
        "eventDateNote",
        "eventDateConfirmed",
        "openBlockers",
        "internalSummary",
      ] as const;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of fieldKeys) {
        if (data[key] === undefined) continue;
        const prev = before[key];
        const next = data[key];
        const prevNorm = prev instanceof Date ? prev.toISOString().slice(0, 10) : prev;
        const nextNorm = next instanceof Date ? next.toISOString().slice(0, 10) : next;
        if (prevNorm !== nextNorm) {
          changes[key] = { from: prevNorm, to: nextNorm };
        }
      }

      const projectRow = await tx.project.update({
        where: { id },
        data,
        select: selectOut,
      });

      if (Object.keys(changes).length > 0) {
        await appendProjectActivityLog(tx, {
          projectId: id,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_UPDATED,
          payload: { changes } as Prisma.InputJsonValue,
        });
      }
      if (archive === true) {
        await appendProjectActivityLog(tx, {
          projectId: id,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_ARCHIVED,
          payload: {} as Prisma.InputJsonValue,
        });
      }

      return {
        ...projectRow,
        eventStartDate: toDateOnly(projectRow.eventStartDate),
        eventEndDate: toDateOnly(projectRow.eventEndDate),
      };
    });

    return jsonOk({ project });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return jsonError(404, "Проект не найден");
    }
    if (e instanceof Error && e.message === "ARCHIVED") {
      return jsonError(400, "Архивный проект только для просмотра");
    }
    throw e;
  }
}
