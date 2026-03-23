import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { prisma } from "@/server/db";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const run = await prisma.inventoryAuditRun.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      severity: true,
      startedAt: true,
      finishedAt: true,
      summaryJson: true,
      errorText: true,
      itemResults: {
        orderBy: [{ severity: "desc" }, { item: { name: "asc" } }],
        select: {
          id: true,
          itemId: true,
          severity: true,
          expectedJson: true,
          actualJson: true,
          deltaJson: true,
          explanationJson: true,
          item: { select: { name: true } },
        },
      },
    },
  });

  if (!run) return jsonError(404, "Run not found");
  return jsonOk({ run });
}

