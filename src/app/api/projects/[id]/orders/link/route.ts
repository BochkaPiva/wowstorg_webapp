import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { assertProjectEditable } from "@/server/projects/project-guard";
import { LinkProjectOrdersError, linkOrdersToProject } from "@/server/projects/link-project-orders";

const BodySchema = z
  .object({
    orderIds: z.array(z.string().trim().min(1)).min(1).max(50),
    targetEstimateVersionId: z.string().trim().min(1).optional(),
  })
  .strict();

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

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  try {
    const result = await linkOrdersToProject({
      projectId,
      actorUserId: auth.user.id,
      orderIds: parsed.data.orderIds,
      targetEstimateVersionId: parsed.data.targetEstimateVersionId,
    });

    scheduleAfterResponse("notifyProjectOrdersLinked", async () => {
      const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
      await notifyProjectNoisyBlock({
        projectId,
        actorUserId: auth.user.id,
        block: "estimate",
        action: `К проекту привязано заявок: ${result.linkedOrderIds.length}.`,
      });
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof LinkProjectOrdersError) {
      if (error.code === "PROJECT_NOT_FOUND") return jsonError(404, error.message);
      return jsonError(400, error.message, error.details);
    }
    throw error;
  }
}
