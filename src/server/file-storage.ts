import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

const LOCAL_PHOTOS_DIR = join(process.cwd(), "data", "item-photos");
const LOCAL_ESTIMATES_DIR = join(process.cwd(), "data", "estimates");
const LOCAL_PROJECT_FILES_DIR = join(process.cwd(), "data", "project-files");

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const photosBucket = (process.env.SUPABASE_STORAGE_PHOTOS_BUCKET?.trim() || "item-photos").toLowerCase();
  const estimatesBucket = (process.env.SUPABASE_STORAGE_ESTIMATES_BUCKET?.trim() || "estimates").toLowerCase();
  const projectsBucket = (process.env.SUPABASE_STORAGE_PROJECTS_BUCKET?.trim() || "project-files").toLowerCase();
  return { url, key, photosBucket, estimatesBucket, projectsBucket };
}

function isSupabaseStorageEnabled() {
  const c = supabaseConfig();
  return Boolean(c.url && c.key);
}

function assertStorageConfiguredForProduction() {
  if (process.env.NODE_ENV === "production" && !isSupabaseStorageEnabled()) {
    throw new Error("Supabase Storage env is not configured in production");
  }
}

function normalizePathForObjectUrl(path: string) {
  return path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
}

async function supabaseUpload(args: {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  upsert?: boolean;
}) {
  const c = supabaseConfig();
  if (!c.url || !c.key) throw new Error("Supabase Storage is not configured");
  const objectPath = normalizePathForObjectUrl(args.key);
  const url = `${c.url.replace(/\/+$/g, "")}/storage/v1/object/${args.bucket}/${objectPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.key}`,
      apikey: c.key,
      "Content-Type": args.contentType,
      "x-upsert": args.upsert === false ? "false" : "true",
    },
    // Next.js/Vercel TypeScript typing for fetch expects BodyInit;
    // pass binary payload as Uint8Array to avoid Buffer mismatch.
    body: new Uint8Array(args.body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed (${res.status}): ${txt || "no body"}`);
  }
}

async function supabaseDownload(args: { bucket: string; key: string }) {
  const c = supabaseConfig();
  if (!c.url || !c.key) throw new Error("Supabase Storage is not configured");
  const objectPath = normalizePathForObjectUrl(args.key);
  const url = `${c.url.replace(/\/+$/g, "")}/storage/v1/object/${args.bucket}/${objectPath}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${c.key}`,
      apikey: c.key,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase download failed (${res.status}): ${txt || "no body"}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function supabaseDelete(args: { bucket: string; key: string }) {
  const c = supabaseConfig();
  if (!c.url || !c.key) throw new Error("Supabase Storage is not configured");
  const objectPath = normalizePathForObjectUrl(args.key);
  const url = `${c.url.replace(/\/+$/g, "")}/storage/v1/object/${args.bucket}/${objectPath}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${c.key}`,
      apikey: c.key,
    },
  });
  if (res.status === 404) return;
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase delete failed (${res.status}): ${txt || "no body"}`);
  }
}

export async function putItemPhoto(key: string, body: Buffer, contentType: string) {
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { photosBucket } = supabaseConfig();
    await supabaseUpload({ bucket: photosBucket, key, body, contentType, upsert: true });
    return;
  }
  mkdirSync(LOCAL_PHOTOS_DIR, { recursive: true });
  writeFileSync(join(LOCAL_PHOTOS_DIR, key), body);
}

export async function getItemPhoto(key: string) {
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { photosBucket } = supabaseConfig();
    return supabaseDownload({ bucket: photosBucket, key });
  }
  try {
    return readFileSync(join(LOCAL_PHOTOS_DIR, key));
  } catch {
    return null;
  }
}

export async function deleteItemPhoto(key: string) {
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { photosBucket } = supabaseConfig();
    try {
      await supabaseDelete({ bucket: photosBucket, key });
    } catch {
      // best-effort cleanup
    }
    return;
  }
  try {
    unlinkSync(join(LOCAL_PHOTOS_DIR, key));
  } catch {
    // best-effort cleanup
  }
}

export async function putEstimateFile(key: string, body: Buffer) {
  const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { estimatesBucket } = supabaseConfig();
    await supabaseUpload({ bucket: estimatesBucket, key, body, contentType, upsert: true });
    return;
  }
  mkdirSync(LOCAL_ESTIMATES_DIR, { recursive: true });
  writeFileSync(join(LOCAL_ESTIMATES_DIR, key), body);
}

export async function getEstimateFile(key: string) {
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { estimatesBucket } = supabaseConfig();
    return supabaseDownload({ bucket: estimatesBucket, key });
  }
  try {
    return readFileSync(join(LOCAL_ESTIMATES_DIR, key));
  } catch {
    return null;
  }
}

export async function deleteEstimateFile(key: string) {
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { estimatesBucket } = supabaseConfig();
    try {
      await supabaseDelete({ bucket: estimatesBucket, key });
    } catch {
      // best-effort cleanup
    }
    return;
  }
  try {
    unlinkSync(join(LOCAL_ESTIMATES_DIR, key));
  } catch {
    // best-effort cleanup
  }
}

export async function putProjectFile(key: string, body: Buffer, contentType: string) {
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { projectsBucket } = supabaseConfig();
    await supabaseUpload({ bucket: projectsBucket, key, body, contentType, upsert: true });
    return;
  }
  const safeKey = key.replace(/[/\\]/g, "_");
  mkdirSync(LOCAL_PROJECT_FILES_DIR, { recursive: true });
  writeFileSync(join(LOCAL_PROJECT_FILES_DIR, safeKey), body);
}

export async function getProjectFile(key: string) {
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { projectsBucket } = supabaseConfig();
    return supabaseDownload({ bucket: projectsBucket, key });
  }
  const safeKey = key.replace(/[/\\]/g, "_");
  try {
    return readFileSync(join(LOCAL_PROJECT_FILES_DIR, safeKey));
  } catch {
    return null;
  }
}

export async function deleteProjectFile(key: string) {
  assertStorageConfiguredForProduction();
  if (isSupabaseStorageEnabled()) {
    const { projectsBucket } = supabaseConfig();
    try {
      await supabaseDelete({ bucket: projectsBucket, key });
    } catch {
      // best-effort cleanup
    }
    return;
  }
  const safeKey = key.replace(/[/\\]/g, "_");
  try {
    unlinkSync(join(LOCAL_PROJECT_FILES_DIR, safeKey));
  } catch {
    // best-effort cleanup
  }
}

