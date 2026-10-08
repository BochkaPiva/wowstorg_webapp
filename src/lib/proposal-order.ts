/** Insert an existing ID before a sibling, or at the end. Never invent IDs. */
export function proposalOrder(ids: readonly string[], id: string, beforeId: string | null): string[] {
  if (!ids.includes(id) || beforeId === id || (beforeId !== null && !ids.includes(beforeId))) throw new Error("INVALID_TARGET");
  const next = ids.filter((entry) => entry !== id);
  next.splice(beforeId === null ? next.length : next.indexOf(beforeId), 0, id);
  return next;
}
