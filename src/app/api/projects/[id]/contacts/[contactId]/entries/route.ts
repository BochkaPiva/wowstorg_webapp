import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { assertProjectEditable } from "@/server/projects/project-guard";

const CreateEntrySchema = z
  .object({
    body: z.string().trim().min(1).max(20000),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; contactId: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: projectId, contactId } = await ctx.params;
  if (!projectId?.trim() || !contactId?.trim()) return jsonError(400, "Invalid id");

  const guard = await assertProjectEditable(projectId);
  if (!guard.ok) return jsonError(guard.status, guard.message);

  const contact = await prisma.projectContact.findFirst({
    where: { id: contactId, projectId },
    select: { id: true, fullName: true, category: true },
  });
  if (!contact) return jsonError(404, "Контакт не найден");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = CreateEntrySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const entry = await prisma.projectCommunicationEntry.create({
    data: {
      contactId,
      authorUserId: auth.user.id,
      body: parsed.data.body,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, displayName: true } },
    },
  });

  scheduleAfterResponse("notifyProjectContactEntry", async () => {
    const { notifyProjectContactChange } = await import("@/server/projects/project-notifications");
    await notifyProjectContactChange({
      projectId,
      actorUserId: auth.user.id,
      contactName: contact.fullName,
      category: contact.category,
      action: "entry",
    });
  });

  return jsonOk({
    entry: {
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    },
  });
}
