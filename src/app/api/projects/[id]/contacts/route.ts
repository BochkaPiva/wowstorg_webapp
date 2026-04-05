import { type Prisma, ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { assertProjectEditable } from "@/server/projects/project-guard";

const CreateContactSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(80).optional().nullable(),
    email: z.string().trim().max(200).optional().nullable(),
    roleNote: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

function normalizeOptional(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId?.trim()) return jsonError(400, "Invalid id");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return jsonError(404, "Проект не найден");

  const contacts = await prisma.projectContact.findMany({
    where: { projectId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      roleNote: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      entries: {
        orderBy: { createdAt: "desc" },
        take: 150,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, displayName: true } },
        },
      },
    },
  });

  return jsonOk({
    contacts: contacts.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      entries: c.entries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    })),
  });
}

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

  const parsed = CreateContactSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const email = normalizeOptional(parsed.data.email ?? undefined);
  if (email && !z.string().email().safeParse(email).success) {
    return jsonError(400, "Некорректный email");
  }

  const contact = await prisma.$transaction(async (tx) => {
    const row = await tx.projectContact.create({
      data: {
        projectId,
        fullName: parsed.data.fullName.trim(),
        phone: normalizeOptional(parsed.data.phone ?? undefined),
        email,
        roleNote: normalizeOptional(parsed.data.roleNote ?? undefined),
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        roleNote: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await appendProjectActivityLog(tx, {
      projectId,
      actorUserId: auth.user.id,
      kind: ProjectActivityKind.PROJECT_CONTACT_CREATED,
      payload: {
        contactId: row.id,
        fullName: row.fullName,
      } as Prisma.InputJsonValue,
    });
    return row;
  });

  return jsonOk({
    contact: {
      ...contact,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
      entries: [],
    },
  });
}
