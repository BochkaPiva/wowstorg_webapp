"use client";

import React from "react";

const SECTION_TYPE = "application/x-wowstorg-estimate-section";
const CONTROLS = "button,input,textarea,select,a,[role='button'],[contenteditable='true']";

type Section = { id: string; title: string; kind: string };
type DragState = { sourceId: string; targetId: string; edge: "before" | "after" };

/** Native header drag, like the task board. The browser owns the preview and scroll. */
export function useEstimateSectionDrag({ disabled, sections, reorder }: {
  disabled: boolean;
  sections: () => Section[];
  reorder: (sourceId: string, targetId: string) => void;
}) {
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const active = React.useRef<string | null>(null);
  const blocked = React.useRef(false);
  const draggedClick = React.useRef(false);
  const clickReset = React.useRef<number | null>(null);
  const dragActive = Boolean(drag);
  const finish = React.useCallback(() => {
    active.current = null;
    setDrag(null);
    if (clickReset.current !== null) window.clearTimeout(clickReset.current);
    // Suppress only the release click, not a later keyboard activation.
    clickReset.current = window.setTimeout(() => {
      draggedClick.current = false;
      clickReset.current = null;
    }, 0);
  }, []);

  React.useEffect(() => () => {
    if (clickReset.current !== null) window.clearTimeout(clickReset.current);
  }, []);

  React.useEffect(() => {
    if (!dragActive) return;
    // A successful reorder may unmount its source before dragend reaches React.
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    const hidden = () => { if (document.visibilityState === "hidden") finish(); };
    document.addEventListener("dragend", finish, true);
    document.addEventListener("drop", finish);
    document.addEventListener("pointerdown", finish, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", finish);
    return () => {
      document.removeEventListener("dragend", finish, true);
      document.removeEventListener("drop", finish);
      document.removeEventListener("pointerdown", finish, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", finish);
    };
  }, [dragActive, finish]);

  function bindings(sectionId: string) {
    return {
      onPointerDownCapture(event: React.PointerEvent<HTMLElement>) {
        if (clickReset.current !== null) window.clearTimeout(clickReset.current);
        clickReset.current = null;
        draggedClick.current = false;
        const control = (event.target as HTMLElement).closest(CONTROLS);
        blocked.current = Boolean(control && !control.hasAttribute("data-section-drag-title"));
      },
      onDragStart(event: React.DragEvent<HTMLElement>) {
        const target = event.target as HTMLElement;
        const header = target.closest<HTMLElement>(".project-estimate-section__summary");
        if (disabled || blocked.current || !header || !event.currentTarget.contains(header)
          || !sections().some(section => section.id === sectionId && section.kind !== "DRAFT_REQUISITE")) {
          event.preventDefault();
          return;
        }
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(SECTION_TYPE, sectionId);
        // Drag only the compact header, never the expanded table underneath it.
        const box = header.getBoundingClientRect();
        event.dataTransfer.setDragImage(header, Math.max(0, event.clientX - box.left), Math.max(0, event.clientY - box.top));
        active.current = sectionId;
        draggedClick.current = true;
        setDrag({ sourceId: sectionId, targetId: sectionId, edge: "before" });
        setAnnouncement(`Перенос раздела «${sections().find(section => section.id === sectionId)?.title ?? ""}». Escape — отменить.`);
      },
      onDragOver(event: React.DragEvent<HTMLElement>) {
        const sourceId = active.current;
        const ordered = sections().filter(section => section.kind !== "DRAFT_REQUISITE");
        const sourceIndex = ordered.findIndex(section => section.id === sourceId);
        const targetIndex = ordered.findIndex(section => section.id === sectionId);
        if (disabled || !sourceId || sourceIndex < 0 || targetIndex < 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const edge = sourceIndex < targetIndex ? "after" : "before";
        setDrag(prev => prev?.targetId === sectionId && prev.edge === edge ? prev : { sourceId, targetId: sectionId, edge });
      },
      onDrop(event: React.DragEvent<HTMLElement>) {
        const sourceId = active.current;
        if (!sourceId || disabled || event.dataTransfer.getData(SECTION_TYPE) !== sourceId
          || !sections().some(section => section.id === sectionId && section.kind !== "DRAFT_REQUISITE")) return;
        event.preventDefault();
        event.stopPropagation();
        finish();
        if (sourceId === sectionId) return;
        reorder(sourceId, sectionId);
        setAnnouncement("Порядок разделов изменён.");
      },
      onDragEnd: finish,
      onClickCapture(event: React.MouseEvent<HTMLElement>) {
        if (!draggedClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        draggedClick.current = false;
      },
      onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
        if (disabled || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        if (!(event.target as HTMLElement).matches(".project-estimate-section__summary")) return;
        const ordered = sections().filter(section => section.kind !== "DRAFT_REQUISITE");
        const index = ordered.findIndex(section => section.id === sectionId);
        const target = ordered[index + (event.key === "ArrowUp" ? -1 : 1)];
        if (index < 0 || !target) return;
        event.preventDefault();
        event.stopPropagation();
        reorder(sectionId, target.id);
        setAnnouncement(`Раздел «${ordered[index].title}» перемещён ${event.key === "ArrowUp" ? "выше" : "ниже"}.`);
      },
    };
  }

  return { drag, announcement, bindings };
}
