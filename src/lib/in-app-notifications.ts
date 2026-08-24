export type NotificationCursor = {
  id: string;
  createdAt: string;
};

export type NotificationIdentity = NotificationCursor;

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isAfterNotificationCursor(
  row: NotificationIdentity,
  cursor: NotificationCursor,
): boolean {
  const rowTime = timestamp(row.createdAt);
  const cursorTime = timestamp(cursor.createdAt);
  return rowTime > cursorTime || (rowTime === cursorTime && row.id > cursor.id);
}

export function mergeNotificationRows<T extends NotificationIdentity>(
  current: T[],
  incoming: T[],
  limit = 30,
): T[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()]
    .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
}

