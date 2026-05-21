import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { ensureDefaultTaskBoard } from "@/server/work-tasks";

const CreateBoardSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  await ensureDefaultTaskBoard(prisma, auth.user.id);
  const boards = await prisma.workTaskBoard.findMany({
    where: { archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      isDefault: true,
      _count: { select: { tasks: true, columns: true } },
    },
  });

  return jsonOk({ boards });
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

  const parsed = CreateBoardSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const board = await prisma.workTaskBoard.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      createdById: auth.user.id,
    },
    select: { id: true, title: true },
  });

  return jsonOk({ board });
}

