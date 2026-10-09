type Rect = { left: number; right: number; top: number; bottom: number };
/** Fixed coordinates; keep the complete surface inside the visual viewport. */
export function popoverPosition(viewport: { width: number; height: number; top: number }, anchor?: Rect | null) {
  const edge = 12;
  const width = Math.min(anchor ? 580 : 390, Math.max(0, viewport.width - edge * 2));
  const minimumTop = Math.min(viewport.top + edge, Math.max(edge, viewport.height - 160));
  const available = Math.max(0, viewport.height - minimumTop - edge);
  const height = Math.min(anchor ? 540 : available, available);
  if (!anchor) return { left: Math.max(edge, viewport.width - width - edge), top: minimumTop, width, maxHeight: available };
  const below = viewport.height - anchor.bottom - edge - 8;
  const above = anchor.top - minimumTop - 8;
  const useAbove = below < Math.min(height, 280) && above > below;
  const maxHeight = Math.min(height, Math.max(160, useAbove ? above : below));
  const top = Math.max(minimumTop, Math.min(useAbove ? anchor.top - maxHeight - 8 : anchor.bottom + 8, viewport.height - maxHeight - edge));
  return { left: Math.max(edge, Math.min(anchor.right - width, viewport.width - width - edge)), top, width, maxHeight: Math.min(maxHeight, available) };
}
