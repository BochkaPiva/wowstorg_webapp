import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import {
  listOrdersForCleanup,
  ORDER_CLEANUP_SORT_VALUES,
  previewOrderCleanupSelection,
} from "@/server/admin/order-cleanup";
import { prisma } from "@/server/db";

const STATUS_VALUES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
  "CLOSED",
  "CANCELLED",
] as const;

const SOURCE_VALUES = ["all", "GREENWICH_INTERNAL", "WOWSTORG_EXTERNAL"] as const;

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  source: z.enum(SOURCE_VALUES).optional().default("all"),
  sort: z.enum(ORDER_CLEANUP_SORT_VALUES).optional().default("readyBy_asc"),
  status: z.string().trim().max(500).optional(),
  selected: z.string().trim().max(10_000).optional(),
});

function parseStatusFilter(raw: string | undefined) {
  if (!raw?.trim()) return [...STATUS_VALUES];
  const allowed = new Set<string>(STATUS_VALUES);
  const picked = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is (typeof STATUS_VALUES)[number] => allowed.has(value));
  return picked.length > 0 ? picked : [...STATUS_VALUES];
}

function parseIdList(raw: string | undefined) {
  return [...new Set((raw ?? "").split(",").map((value) => value.trim()).filter(Boolean))];
}

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    selected: url.searchParams.get("selected") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, "Некорректные параметры запроса", parsed.error.flatten());
  }

  const selectedIds = parseIdList(parsed.data.selected);
  const [orders, preview] = await Promise.all([
    listOrdersForCleanup(prisma, {
      q: parsed.data.q,
      source: parsed.data.source,
      sort: parsed.data.sort,
      statuses: parseStatusFilter(parsed.data.status),
    }),
    selectedIds.length > 0
      ? previewOrderCleanupSelection(prisma, selectedIds)
      : Promise.resolve(null),
  ]);

  return jsonOk({ orders, preview });
}
