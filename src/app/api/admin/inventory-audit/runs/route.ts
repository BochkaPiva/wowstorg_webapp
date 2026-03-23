import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { prisma } from "@/server/db";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? "20",
  });
  if (!parsed.success) return jsonError(400, "Invalid query", parsed.error.flatten());

  const rows = await prisma.inventoryAuditRun.findMany({
    take: parsed.data.limit,
    orderBy: [{ startedAt: "desc" }],
    select: {
      id: true,
      kind: true,
      severity: true,
      startedAt: true,
      finishedAt: true,
      summaryJson: true,
      errorText: true,
    },
  });
  return jsonOk({ rows });
}

