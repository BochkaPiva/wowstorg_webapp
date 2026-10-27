import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const schema = z.object({ records: z.array(z.object({ kind: z.enum(["project", "order"]), id: z.string().min(1).max(128) }).strict()).min(1).max(200) }).strict();
export async function POST(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Некорректный список записей");
  const projects = parsed.data.records.filter((r) => r.kind === "project").map((r) => r.id);
  const orders = parsed.data.records.filter((r) => r.kind === "order").map((r) => r.id);
  const where = { OR: [
    { projectId: { in: projects }, project: { OR: [{ archivedAt: { not: null } }, { status: { in: ["COMPLETED", "CANCELLED"] as ("COMPLETED" | "CANCELLED")[] } }] } },
    { orderId: { in: orders }, order: { status: { in: ["CLOSED", "CANCELLED"] as ("CLOSED" | "CANCELLED")[] } } },
  ] };
  const [files, marks] = await Promise.all([
    prisma.archiveDocument.findMany({ where, select: { id: true, projectId: true, orderId: true, originalName: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.archiveRegisterMark.findMany({ where, select: { projectId: true, orderId: true, recorded: true } }),
  ]);
  return jsonOk({ files, marks });
}
