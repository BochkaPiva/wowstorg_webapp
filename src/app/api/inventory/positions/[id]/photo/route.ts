import sharp from "sharp";

import { prisma } from "@/server/db";
import { requireRole, requireUser } from "@/server/auth/require";
import { deleteItemPhoto, getItemPhoto, putItemPhoto } from "@/server/file-storage";
import { jsonError, jsonOk } from "@/server/http";

function guessExt(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

function guessContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const req = _req;
  const url = new URL(req.url);
  const requestedWidth = Number.parseInt(url.searchParams.get("w") ?? "", 10);
  const previewWidth =
    Number.isFinite(requestedWidth) && requestedWidth > 0
      ? Math.max(160, Math.min(requestedWidth, 960))
      : null;

  const { id } = await ctx.params;
  const item = await prisma.item.findUnique({ where: { id }, select: { photo1Key: true } });
  if (!item?.photo1Key) return new Response(null, { status: 404 });

  const buf = await getItemPhoto(item.photo1Key);
  if (!buf) return new Response(null, { status: 404 });
  if (previewWidth) {
    const preview = await sharp(buf)
      .rotate()
      .resize({ width: previewWidth, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return new Response(new Uint8Array(preview), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=600, stale-while-revalidate=86400",
      },
    });
  }
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": guessContentType(item.photo1Key),
      "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const item = await prisma.item.findUnique({ where: { id }, select: { id: true, photo1Key: true } });
  if (!item) return jsonError(404, "Not found");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Invalid form data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "file is required");
  if (!file.type.startsWith("image/")) return jsonError(400, "Только изображения");
  if (file.size > 5 * 1024 * 1024) return jsonError(400, "Файл слишком большой (макс. 5MB)");

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = guessExt(file.type);
  const fileKey = `items/${id}/${id}-${Date.now()}.${ext}`;

  try {
    await putItemPhoto(fileKey, buf, file.type || "image/jpeg");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown storage error";
    console.error("[item-photo] save failed:", msg);
    return jsonError(500, `Не удалось сохранить файл: ${msg}`);
  }

  await prisma.item.update({ where: { id }, data: { photo1Key: fileKey } });

  // best-effort cleanup old
  if (item.photo1Key) {
    await deleteItemPhoto(item.photo1Key);
  }

  return jsonOk({ ok: true, photo1Key: fileKey });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const item = await prisma.item.findUnique({ where: { id }, select: { photo1Key: true } });
  if (!item?.photo1Key) return jsonOk({ ok: true });

  await prisma.item.update({ where: { id }, data: { photo1Key: null } });
  await deleteItemPhoto(item.photo1Key);
  return jsonOk({ ok: true });
}

