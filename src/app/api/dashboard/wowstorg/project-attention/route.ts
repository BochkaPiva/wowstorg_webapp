import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const PROJECT_ATTENTION_BLOCK_KEY = "dashboard-attention";

const BodySchema = z.object({
  projectId: z.string().min(1),
  days: z.number().int().min(1).max(30).default(7),
});

export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid body", parsed.error.flatten());

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, archivedAt: true, status: true },
  });
  if (!project) return jsonError(404, "Project not found");
  if (project.archivedAt != null || project.status === "COMPLETED" || project.status === "CANCELLED") {
    return jsonError(409, "Project is not active");
  }

  const muteUntil = new Date(Date.now() + parsed.data.days * 24 * 60 * 60 * 1000);
  await prisma.projectNotificationCooldown.upsert({
    where: {
      projectId_blockKey: {
        projectId: project.id,
        blockKey: PROJECT_ATTENTION_BLOCK_KEY,
      },
    },
    create: {
      projectId: project.id,
      blockKey: PROJECT_ATTENTION_BLOCK_KEY,
      muteUntil,
    },
    update: {
      muteUntil,
    },
  });

  return jsonOk({ ok: true, muteUntil: muteUntil.toISOString() });
}
