import { ProjectActivityKind, ProjectBall, ProjectStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { ensureDefaultProjectFolders } from "@/server/projects/project-files";

const CreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    customerId: z.string().trim().min(1),
    status: z.nativeEnum(ProjectStatus).optional(),
    ball: z.nativeEnum(ProjectBall).optional(),
  })
  .strict();

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const archived = url.searchParams.get("archive") === "1";

  const projects = await prisma.project.findMany({
    where: archived ? { archivedAt: { not: null } } : { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true,
      title: true,
      status: true,
      ball: true,
      archivedAt: true,
      updatedAt: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
      owner: { select: { id: true, displayName: true } },
      _count: { select: { orders: true } },
    },
  });

  return jsonOk({ projects });
}

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const customer = await prisma.customer.findUnique({
    where: { id: parsed.data.customerId },
    select: { id: true },
  });
  if (!customer) {
    return jsonError(400, "Заказчик не найден");
  }

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        title: parsed.data.title,
        customerId: parsed.data.customerId,
        ownerUserId: auth.user.id,
        status: parsed.data.status ?? ProjectStatus.LEAD,
        ball: parsed.data.ball ?? ProjectBall.CLIENT,
      },
      select: {
        id: true,
        title: true,
        status: true,
        ball: true,
        archivedAt: true,
        customerId: true,
        ownerUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await ensureDefaultProjectFolders(tx, p.id);
    await appendProjectActivityLog(tx, {
      projectId: p.id,
      actorUserId: auth.user.id,
      kind: ProjectActivityKind.PROJECT_CREATED,
      payload: { title: p.title },
    });
    return p;
  });

  return jsonOk({ project });
}
