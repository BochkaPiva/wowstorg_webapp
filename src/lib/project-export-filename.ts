function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatDateForName(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-");
  if (!year || !month || !day) return dateOnly.replace(/-/g, ".");
  return `${day}.${month}.${year}`;
}

export function buildProjectDocumentBaseName(args: {
  eventTitle?: string | null;
  customerName?: string | null;
  eventDateConfirmed?: boolean;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
}): string {
  const eventTitle = compactWhitespace(args.eventTitle ?? "");
  const customerName = compactWhitespace(args.customerName ?? "");

  const name = eventTitle || customerName || "project";
  if (!args.eventDateConfirmed || !args.eventStartDate || !args.eventEndDate) return name;

  const start = formatDateForName(args.eventStartDate);
  const end = formatDateForName(args.eventEndDate);
  const dateLabel = start === end ? start : `${start}-${end}`;
  return compactWhitespace(`${name} ${dateLabel}`);
}

export function buildAsciiFilenameFallback(value: string, fallback: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return ascii || fallback;
}

export function buildUtf8AttachmentDisposition(filename: string): string {
  const safe = filename.replace(/["\\]/g, "_");
  const fallback = buildAsciiFilenameFallback(safe, "download");
  const utf8 = encodeURIComponent(safe);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${utf8}`;
}
