import { type Prisma, ProjectActivityKind, ProjectContactCategory } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";

const PatchSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().max(80).optional().nullable(),
    email: z.string().trim().max(200).optional().nullable(),
    category: z.nativeEnum(ProjectContactCategory).optional(),
    roleNote: z.string().trim().max(500).optional().nullable(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

function normalizeOptional(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; contactId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, contactId } = await ctx.params;
  if (!projectId?.trim() || !contactId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

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

  if (Object.keys(parsed.data).length === 0) {
    return jsonError(400, "Нет полей для обновления");
  }

  const emailIn = parsed.data.email !== undefined ? normalizeOptional(parsed.data.email) : undefined;
  if (emailIn && !z.string().email().safeParse(emailIn).success) {
    return jsonError(400, "Некорректный email");
  }

  const data: {
    fullName?: string;
    phone?: string | null;
    email?: string | null;
    category?: ProjectContactCategory;
    roleNote?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  } = {};

  if (parsed.data.fullName !== undefined) data.fullName = parsed.data.fullName.trim();
  if (parsed.data.phone !== undefined) data.phone = normalizeOptional(parsed.data.phone ?? undefined);
  if (parsed.data.email !== undefined) data.email = emailIn ?? null;
  if (parsed.data.category !== undefined) data.category = parsed.data.category;
  if (parsed.data.roleNote !== undefined) data.roleNote = normalizeOptional(parsed.data.roleNote ?? undefined);
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;

  const fieldKeys = ["fullName", "phone", "email", "category", "roleNote", "isActive", "sortOrder"] as const;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.projectContact.findFirst({
        where: { id: contactId, projectId },
        select: {
          fullName: true,
          phone: true,
          email: true,
          category: true,
          roleNote: true,
          isActive: true,
          sortOrder: true,
        },
      });
      if (!before) {
        throw new Error("NOT_FOUND");
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of fieldKeys) {
        if (data[key] === undefined) continue;
        const prev = before[key];
        const next = data[key];
        if (prev !== next) {
          changes[key] = { from: prev, to: next };
        }
      }

      const row = await tx.projectContact.update({
        where: { id: contactId },
        data,
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          category: true,
          roleNote: true,
          isActive: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (Object.keys(changes).length > 0) {
        await appendProjectActivityLog(tx, {
          projectId,
          actorUserId: auth.user.id,
          kind: ProjectActivityKind.PROJECT_CONTACT_UPDATED,
          payload: {
            contactId,
            changes,
          } as Prisma.InputJsonValue,
        });
      }

      return { row, changes };
    });

    if (Object.keys(result.changes).length > 0) {
      scheduleAfterResponse("notifyProjectContactUpdated", async () => {
        const { notifyProjectContactChange } = await import("@/server/projects/project-notifications");
        await notifyProjectContactChange({
          projectId,
          actorUserId: auth.user.id,
          contactName: result.row.fullName,
          category: result.row.category,
          action: "updated",
          changes: result.changes,
        });
      });
    }

    return jsonOk({
      contact: {
        ...result.row,
        createdAt: result.row.createdAt.toISOString(),
        updatedAt: result.row.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return jsonError(404, "Контакт не найден");
    }
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; contactId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, contactId } = await ctx.params;
  if (!projectId?.trim() || !contactId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  const before = await prisma.projectContact.findFirst({
    where: { id: contactId, projectId },
    select: { id: true, fullName: true, category: true },
  });
  if (!before) return jsonError(404, "Контакт не найден");

  await prisma.$transaction(async (tx) => {
    await tx.projectContact.delete({ where: { id: contactId } });
  });

  scheduleAfterResponse("notifyProjectContactDeleted", async () => {
    const { notifyProjectContactChange } = await import("@/server/projects/project-notifications");
    await notifyProjectContactChange({
      projectId,
      actorUserId: auth.user.id,
      contactName: before.fullName,
      category: before.category,
      action: "updated",
      changes: { deleted: { from: before.fullName, to: "удалён" } },
    });
  });

  return jsonOk({ ok: true });
}
