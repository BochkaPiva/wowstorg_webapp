import type { ProjectWorkspaceItem } from "@prisma/client";

import {
  ProjectFreeBoardItemInputSchema,
  type ProjectFreeBoardItemDto,
} from "@/lib/projects/project-free-board";

export function serializeProjectFreeBoardItem(
  item: ProjectWorkspaceItem,
): ProjectFreeBoardItemDto | null {
  const parsed = ProjectFreeBoardItemInputSchema.safeParse({
    id: item.id,
    type: item.type,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    zIndex: item.zIndex,
    payload: item.payload,
    ...(item.linkedTaskId ? { linkedTaskId: item.linkedTaskId } : {}),
    ...(item.linkedOrderId ? { linkedOrderId: item.linkedOrderId } : {}),
    ...(item.linkedFileId ? { linkedFileId: item.linkedFileId } : {}),
    ...(item.linkedSectionId ? { linkedSectionId: item.linkedSectionId } : {}),
    expectedRevision: item.revision,
  });

  if (!parsed.success) return null;
  const value = { ...parsed.data };
  delete value.expectedRevision;
  return {
    ...value,
    revision: item.revision,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  } as ProjectFreeBoardItemDto;
}
