"use client";
import type { ProjectFreeBoardLinkedItemType } from "./project-free-board";

// One-shot UI intent, not persisted business data or a second board mutation queue.
const pending = new Map<string, { type: ProjectFreeBoardLinkedItemType; id: string }>();
export function queueProjectBoardInsertion(projectId: string, value: { type: ProjectFreeBoardLinkedItemType; id: string }) { pending.set(projectId, value); }
export function takeProjectBoardInsertion(projectId: string) { const value = pending.get(projectId); pending.delete(projectId); return value; }
