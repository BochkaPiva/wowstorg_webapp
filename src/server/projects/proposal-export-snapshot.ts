import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { prisma } from "@/server/db";
import { getCustomerLogo } from "@/server/file-storage";
import { buildProposalReadModel } from "./proposal-read-model";
import { exportChecksum, projectClientDocument, type ExportPhoto } from "./proposal-export-document";

type CaptureRequest = { proposalId: string; expectedRevision: number; variantId: string; exportId: string; userId: string };
const requestHash = (request: CaptureRequest) => createHash("sha256").update(JSON.stringify([request.proposalId, request.expectedRevision, request.variantId, request.userId])).digest("hex");
function matchingSnapshot(snapshot: { proposalId: string; createdById: string; internalSummary: Prisma.JsonValue }, request: CaptureRequest) {
  const summary = snapshot.internalSummary as { requestHash?: string };
  if (snapshot.proposalId !== request.proposalId || snapshot.createdById !== request.userId || summary?.requestHash !== requestHash(request)) throw new Error("EXPORT_ID_CONFLICT");
}

/** Download only known private asset keys, never URLs supplied by clients or arbitrary snapshot hosts. */
async function capturePhoto(url: string, signal: AbortSignal): Promise<ExportPhoto | null> {
  signal.throwIfAborted();
  const match = /^\/api\/contractors\/([^/?#]+)\/assets\/([^/?#]+)$/.exec(url);
  if (!match) return null;
  const asset = await prisma.contractorAsset.findFirst({ where: { contractorId: match[1], id: match[2] }, select: { storageKey: true, sizeBytes: true } });
  if (!asset) return null;
  if (asset.sizeBytes > 15_000_000) throw new Error("PHOTO_TOO_LARGE");
  const bytes = await getCustomerLogo(asset.storageKey, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), maxBytes: 15_000_000 });
  if (!bytes) return null;
  if (bytes.length > 15_000_000) throw new Error("PHOTO_TOO_LARGE");
  const encoded = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true }).flatten({ background: "#6C2F85" }).jpeg({ quality: 78, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  if (encoded.data.length > 400_000) throw new Error("PHOTO_TOO_LARGE");
  return { jpeg: encoded.data.toString("base64"), width: encoded.info.width, height: encoded.info.height };
}

export async function captureProposalExport(request: CaptureRequest) {
  const existing = await prisma.projectProposalSnapshot.findUnique({ where: { id: request.exportId } });
  if (existing) { matchingSnapshot(existing, request); return existing; }
  const proposal = await buildProposalReadModel(request.proposalId);
  if (!proposal) throw new Error("NOT_FOUND");
  if (proposal.revision !== request.expectedRevision) throw new Error("REVISION_CONFLICT");
  // The projection has a separate type and deliberately drops private fields before any rendering.
  const document = projectClientDocument(proposal as unknown as Parameters<typeof projectClientDocument>[0], request.variantId);
  const source = proposal.variants.find(variant => variant.id === request.variantId)!;
  const photos = new Map<string, ExportPhoto | null>();
  const deadline = AbortSignal.timeout(25_000);
  let photoBytes = 0;
  const sourceSections = source.sections.filter(section => section.items.some(item => item.selectionRole !== "EXCLUDED"));
  for (const [sectionIndex, section] of document.sections.entries()) {
    const visible = sourceSections[sectionIndex].items.filter(item => item.selectionRole !== "EXCLUDED");
    for (const [index, item] of section.items.entries()) {
      const asset = visible[index]?.assetSnapshot;
      const url = Array.isArray(asset) && asset[0] && typeof asset[0] === "object" && "url" in asset[0] ? String(asset[0].url) : null;
      if (!url) continue;
      if (!photos.has(url)) photos.set(url, await capturePhoto(url, deadline));
      item.photo = photos.get(url) ?? null;
      photoBytes += item.photo?.jpeg.length ?? 0;
      if (photoBytes > 7_500_000) throw new Error("EXPORT_TOO_LARGE");
    }
  }
  const serialized = JSON.stringify(document);
  if (Buffer.byteLength(serialized) > 8_000_000) throw new Error("EXPORT_TOO_LARGE");
  const checksum = exportChecksum(document);
  return prisma.$transaction(async tx => {
    const retry = await tx.projectProposalSnapshot.findUnique({ where: { id: request.exportId } });
    if (retry) { matchingSnapshot(retry, request); return retry; }
    const current = await tx.projectProposal.findUnique({ where: { id: request.proposalId }, select: { revision: true } });
    if (!current) throw new Error("NOT_FOUND");
    if (current.revision !== request.expectedRevision) throw new Error("REVISION_CONFLICT");
    const latest = await tx.projectProposalSnapshot.aggregate({ where: { proposalId: request.proposalId }, _max: { versionNumber: true } });
    return tx.projectProposalSnapshot.create({ data: {
      id: request.exportId, proposalId: request.proposalId, versionNumber: (latest._max.versionNumber ?? 0) + 1,
      reason: "EXPORT", createdById: request.userId, clientData: document as unknown as Prisma.InputJsonValue,
      internalSummary: { requestHash: requestHash(request), sourceRevision: request.expectedRevision }, checksum,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
}
