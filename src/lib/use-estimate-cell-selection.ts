"use client";

import {useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent} from "react";

type Selection = {row: number; startColumn: number; endColumn: number};

/** Preserve text selection inside an editor; select cells only after crossing a cell boundary. */
export function useEstimateCellSelection(disabled: boolean, onSelect: (selection: Selection) => void) {
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    abortRef.current?.abort();
    document.body.classList.remove("project-estimate-cell-selecting");
  }, [disabled]);

  return useCallback((event: ReactPointerEvent<HTMLElement>, row: number, column: number) => {
    if (event.button !== 0 || disabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const sheet = event.currentTarget.closest(".estimate-sheet");
    const startX = event.clientX, startY = event.clientY;
    let moved = false;
    onSelect({row, startColumn: column, endColumn: column});
    const move = (pointer: PointerEvent) => {
      if (!moved && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 5) return;
      const cell = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>("[data-estimate-grid-cell]");
      if (!cell || cell.closest(".estimate-sheet") !== sheet) return;
      const nextRow = Number(cell.dataset.estimateGridCellRow), nextColumn = Number(cell.dataset.estimateGridCellColumn);
      if (nextRow !== row || !Number.isInteger(nextColumn) || (!moved && nextColumn === column)) return;
      moved = true;
      pointer.preventDefault();
      document.body.classList.add("project-estimate-cell-selecting");
      document.getSelection()?.removeAllRanges();
      onSelect({row, startColumn: column, endColumn: nextColumn});
    };
    const finish = () => { document.body.classList.remove("project-estimate-cell-selecting"); controller.abort(); };
    window.addEventListener("pointermove", move, {passive: false, signal: controller.signal});
    window.addEventListener("pointerup", finish, {once: true, signal: controller.signal});
    window.addEventListener("pointercancel", finish, {once: true, signal: controller.signal});
  }, [disabled, onSelect]);
}
