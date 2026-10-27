import { prisma } from "@/server/db";

export type ArchiveKind = "project" | "order";
export function parseArchiveKind(value: string): ArchiveKind | null {
  return value === "project" || value === "order" ? value : null;
}
export function archiveWhere(kind: ArchiveKind, id: string) {
  return kind === "project" ? { projectId: id } : { orderId: id };
}
export async function archiveTargetExists(kind: ArchiveKind, id: string): Promise<boolean> {
  if (!id || id.length > 128) return false;
  if (kind === "project") return Boolean(await prisma.project.findFirst({ where: { id, OR: [{ archivedAt: { not: null } }, { status: { in: ["COMPLETED", "CANCELLED"] } }] }, select: { id: true } }));
  return Boolean(await prisma.order.findFirst({ where: { id, status: { in: ["CLOSED", "CANCELLED"] } }, select: { id: true } }));
}
