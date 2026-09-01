import { Prisma, ProjectActivityKind, ProjectMemberRole } from "@prisma/client";
import { z } from "zod";

import { PROJECT_WIDGET_TYPES } from "@/lib/projects/project-widget-registry";
import {
  PROJECT_WIDGET_HEIGHT_PRESETS,
  PROJECT_WIDGET_WIDTHS,
  normalizeProjectWorkspaceWidgets,
} from "@/lib/projects/project-workspace";
import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

const WidgetSchema = z
  .object({
    instanceKey: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/),
    type: z.enum(PROJECT_WIDGET_TYPES),
    sortOrder: z.number().int().min(0).max(100),
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0).max(100),
    width: z.union(PROJECT_WIDGET_WIDTHS.map((value) => z.literal(value))),
    heightPreset: z.enum(PROJECT_WIDGET_HEIGHT_PRESETS),
    isVisible: z.boolean(),
  })
  .strict();

const WorkspacePatchSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    ownerUserId: z.string().trim().min(1),
    memberUserIds: z.array(z.string().trim().min(1)).max(50),
    widgets: z.array(WidgetSchema).length(PROJECT_WIDGET_TYPES.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.memberUserIds).size !== value.memberUserIds.length) {
      ctx.addIssue({ code: "custom", path: ["memberUserIds"], message: "Участники не должны повторяться" });
    }
    if (new Set(value.widgets.map((widget) => widget.type)).size !== value.widgets.length) {
      ctx.addIssue({ code: "custom", path: ["widgets"], message: "Типы модулей не должны повторяться" });
    }
    if (new Set(value.widgets.map((widget) => widget.instanceKey)).size !== value.widgets.length) {
      ctx.addIssue({ code: "custom", path: ["widgets"], message: "Ключи модулей не должны повторяться" });
    }
  });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  const parsed = WorkspacePatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const memberUserIds = Array.from(new Set([parsed.data.ownerUserId, ...parsed.data.memberUserIds]));
  const widgets = normalizeProjectWorkspaceWidgets(parsed.data.widgets);

  try {
    await prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id },
          select: {
            revision: true,
            archivedAt: true,
            ownerUserId: true,
            owner: { select: { displayName: true } },
          },
        });
        if (!project) throw new Error("NOT_FOUND");
        if (project.archivedAt) throw new Error("ARCHIVED");
        if (project.revision !== parsed.data.expectedRevision) throw new Error("REVISION_CONFLICT");

        const activeUsers = await tx.user.findMany({
          where: { id: { in: memberUserIds }, role: "WOWSTORG", isActive: true },
          select: { id: true, displayName: true },
        });
        if (activeUsers.length !== memberUserIds.length) throw new Error("INVALID_MEMBERS");
        const activeUserNameById = new Map(activeUsers.map((user) => [user.id, user.displayName]));

        const revisionUpdate = await tx.project.updateMany({
          where: { id, revision: parsed.data.expectedRevision, archivedAt: null },
          data: { ownerUserId: parsed.data.ownerUserId, revision: { increment: 1 } },
        });
        if (revisionUpdate.count !== 1) throw new Error("REVISION_CONFLICT");

        await tx.projectMember.deleteMany({ where: { projectId: id } });
        await tx.projectMember.createMany({
          data: memberUserIds.map((userId) => ({
            projectId: id,
            userId,
            role: userId === parsed.data.ownerUserId ? ProjectMemberRole.OWNER : ProjectMemberRole.EDITOR,
            addedById: auth.user.id,
          })),
        });

        for (const widget of widgets) {
          await tx.projectWidget.upsert({
            where: { projectId_instanceKey: { projectId: id, instanceKey: widget.instanceKey } },
            create: {
              projectId: id,
              ...widget,
              createdById: auth.user.id,
              updatedById: auth.user.id,
            },
            update: {
              type: widget.type,
              sortOrder: widget.sortOrder,
              x: widget.x,
              y: widget.y,
              width: widget.width,
              heightPreset: widget.heightPreset,
              isVisible: widget.isVisible,
              updatedById: auth.user.id,
              revision: { increment: 1 },
            },
          });
        }

        await appendProjectActivityLog(tx, {
          projectId: id,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_UPDATED,
          payload: {
            changes: {
              workspace: {
                from: `v${project.revision}`,
                to: `v${project.revision + 1}`,
              },
              ...(project.ownerUserId !== parsed.data.ownerUserId
                ? {
                    ownerUserId: {
                      from: project.owner.displayName,
                      to: activeUserNameById.get(parsed.data.ownerUserId) ?? "Неизвестный сотрудник",
                    },
                  }
                : {}),
            },
          } as Prisma.InputJsonValue,
        });

      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );

    const result = await prisma.project.findUniqueOrThrow({
      where: { id },
      select: {
        revision: true,
        owner: { select: { id: true, displayName: true } },
        members: {
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          select: { role: true, createdAt: true, user: { select: { id: true, displayName: true } } },
        },
        widgets: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            instanceKey: true,
            type: true,
            schemaVersion: true,
            sortOrder: true,
            x: true,
            y: true,
            width: true,
            heightPreset: true,
            config: true,
            isVisible: true,
            revision: true,
          },
        },
      },
    });

    return jsonOk({ workspace: result });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return jsonError(404, "Проект не найден");
    if (error instanceof Error && error.message === "ARCHIVED") return jsonError(400, "Архивный проект только для просмотра");
    if (error instanceof Error && error.message === "INVALID_MEMBERS") {
      return jsonError(400, "Ответственный и участники должны быть активными сотрудниками Wowstorg");
    }
    if (
      (error instanceof Error && error.message === "REVISION_CONFLICT") ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return jsonError(409, "Карточка проекта уже изменилась. Обновите данные и повторите сохранение.");
    }
    console.error("Failed to save project workspace", error);
    return jsonError(
      500,
      "Не удалось сохранить рабочее пространство",
      process.env.NODE_ENV !== "production"
        ? { message: error instanceof Error ? error.message : String(error) }
        : undefined,
    );
  }
}
