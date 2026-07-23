import { randomUUID } from "crypto";
import sharp from "sharp";

import { prisma } from "@/server/db";
import { requireRole, requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import {
  deleteCustomerLogo,
  getCustomerLogo,
  putCustomerLogo,
} from "@/server/file-storage";

const MAX_SOURCE_BYTES = 6 * 1024 * 1024;
const ALLOWED_SOURCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { logoKey: true, logoMimeType: true, logoUpdatedAt: true },
  });
  if (!customer) return jsonError(404, "Заказчик не найден");
  if (!customer.logoKey) return jsonError(404, "Логотип не загружен");

  const body = await getCustomerLogo(customer.logoKey);
  if (!body) return jsonError(404, "Файл логотипа не найден");

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": customer.logoMimeType ?? "image/webp",
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      "Last-Modified": customer.logoUpdatedAt?.toUTCString() ?? new Date().toUTCString(),
    },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { logoKey: true },
  });
  if (!existing) return jsonError(404, "Заказчик не найден");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "Выберите файл логотипа");
  if (!ALLOWED_SOURCE_TYPES.has(file.type)) {
    return jsonError(400, "Поддерживаются PNG, JPEG и WebP");
  }
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) {
    return jsonError(400, "Размер исходного изображения должен быть не больше 6 МБ");
  }

  let optimized: Buffer;
  try {
    optimized = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, effort: 4 })
      .toBuffer();
  } catch {
    return jsonError(400, "Не удалось обработать изображение");
  }

  const nextKey = `customer-logos/${id}/${randomUUID()}.webp`;
  await putCustomerLogo(nextKey, optimized, "image/webp");

  try {
    const updated = await prisma.customer.update({
      where: { id },
      data: {
        logoKey: nextKey,
        logoMimeType: "image/webp",
        logoUpdatedAt: new Date(),
      },
      select: { id: true, logoUpdatedAt: true },
    });
    if (existing.logoKey) await deleteCustomerLogo(existing.logoKey);
    return jsonOk({
      customer: {
        id: updated.id,
        logoUrl: `/api/customers/${updated.id}/logo?v=${updated.logoUpdatedAt?.getTime() ?? Date.now()}`,
      },
    });
  } catch (error) {
    await deleteCustomerLogo(nextKey);
    throw error;
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { logoKey: true },
  });
  if (!existing) return jsonError(404, "Заказчик не найден");

  await prisma.customer.update({
    where: { id },
    data: { logoKey: null, logoMimeType: null, logoUpdatedAt: null },
  });
  if (existing.logoKey) await deleteCustomerLogo(existing.logoKey);

  return jsonOk({ removed: true });
}
