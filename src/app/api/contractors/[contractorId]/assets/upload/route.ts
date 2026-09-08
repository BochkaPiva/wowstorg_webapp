import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { deleteCustomerLogo, putCustomerLogo } from "@/server/file-storage";
import { jsonError, jsonOk } from "@/server/http";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request, ctx: { params: Promise<{ contractorId: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const { contractorId } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
  if (!contractor) return jsonError(404, "Подрядчик не найден");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "Выберите фотографию");
  if (!ALLOWED_TYPES.has(file.type)) return jsonError(400, "Поддерживаются PNG, JPEG и WebP");
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) return jsonError(400, "Файл должен быть не больше 10 МБ");

  let optimized: Buffer;
  try {
    optimized = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(1600, 1000, { fit: "inside", withoutEnlargement: true }).webp({ quality: 86, effort: 4 }).toBuffer();
  } catch {
    return jsonError(400, "Не удалось обработать изображение");
  }
  const assetId = randomUUID();
  const storageKey = `contractors/${contractorId}/${assetId}.webp`;
  await putCustomerLogo(storageKey, optimized, "image/webp");
  try {
    const max = await prisma.contractorAsset.aggregate({ where: { contractorId, kind: "PHOTO" }, _max: { sortOrder: true } });
    const asset = await prisma.contractorAsset.create({ data: {
      id: assetId, contractorId, storageKey, originalName: file.name || "photo.webp", mimeType: "image/webp",
      sizeBytes: optimized.byteLength, sortOrder: (max._max.sortOrder ?? -1) + 1, uploadedById: auth.user.id,
    }, select: { id: true } });
    return jsonOk({ asset: { id: asset.id, url: `/api/contractors/${contractorId}/assets/${asset.id}` } });
  } catch (error) {
    await deleteCustomerLogo(storageKey);
    throw error;
  }
}

