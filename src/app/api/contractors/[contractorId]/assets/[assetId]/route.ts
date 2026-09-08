import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { deleteCustomerLogo, getCustomerLogo } from "@/server/file-storage";
import { jsonError, jsonOk } from "@/server/http";

export async function GET(_req: Request, ctx: { params: Promise<{ contractorId: string; assetId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { contractorId, assetId } = await ctx.params;
  const asset = await prisma.contractorAsset.findFirst({ where: { id: assetId, contractorId }, select: { storageKey: true, mimeType: true, createdAt: true } });
  if (!asset) return jsonError(404, "Фотография не найдена");
  const body = await getCustomerLogo(asset.storageKey);
  if (!body) return jsonError(404, "Файл фотографии не найден");
  return new Response(new Uint8Array(body), { headers: { "Content-Type": asset.mimeType, "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400", "Last-Modified": asset.createdAt.toUTCString() } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ contractorId: string; assetId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { contractorId, assetId } = await ctx.params;
  const asset = await prisma.contractorAsset.findFirst({ where: { id: assetId, contractorId }, select: { id: true, storageKey: true } });
  if (!asset) return jsonError(404, "Фотография не найдена");
  await prisma.contractorAsset.delete({ where: { id: asset.id } });
  await deleteCustomerLogo(asset.storageKey);
  return jsonOk({ removed: true });
}
