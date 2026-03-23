import { z } from "zod";

import { getAdminAnalyticsData } from "@/server/admin-analytics";
import { buildAdminAnalyticsXlsx } from "@/server/admin-analytics-xlsx";
import { requireRole } from "@/server/auth/require";
import { jsonError } from "@/server/http";

const QuerySchema = z.object({
  section: z.enum(["global", "overview", "tops", "profitability"]).default("global"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    section: url.searchParams.get("section") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Invalid query", parsed.error.flatten());
  const { section, from, to } = parsed.data;
  if (from && to && from > to) return jsonError(400, "`from` must be <= `to`");

  const data = await getAdminAnalyticsData({ from, to });
  const buffer = await buildAdminAnalyticsXlsx(data, section);
  const filename = `analytics-${section}-${todayYmd()}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

