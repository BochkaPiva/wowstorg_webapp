/** Closing timestamps are stored in UTC; recognise the calendar day in Omsk. */
const closingDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Omsk", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Never substitute updatedAt/createdAt: unrelated edits must not move revenue. */
export function projectClosedDate(project: {
  status: string;
  archivedAt: Date | null;
  activityLogs: Array<{ kind: string; payload: unknown; createdAt: Date }>;
}): string | null {
  if (project.status !== "COMPLETED") return null;
  if (project.archivedAt) return closingDay.format(project.archivedAt);
  let completedAt: Date | null = null;
  for (const log of project.activityLogs) {
    if (log.kind !== "PROJECT_UPDATED" || !log.payload || typeof log.payload !== "object" || Array.isArray(log.payload)) continue;
    const changes = (log.payload as { changes?: unknown }).changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) continue;
    const status = (changes as { status?: unknown }).status;
    if (!status || typeof status !== "object" || Array.isArray(status)) continue;
    const change = status as { from?: unknown; to?: unknown };
    if (change.to === "COMPLETED" && change.from !== "COMPLETED" && (!completedAt || log.createdAt > completedAt)) completedAt = log.createdAt;
  }
  return completedAt ? closingDay.format(completedAt) : null;
}
