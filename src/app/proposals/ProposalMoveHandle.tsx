"use client";

import React from "react";
import styles from "./workspace.module.css";

export type ProposalDrop = { kind: "section" | "item"; id: string; placement: "before" | "after" | "inside" };

function scrollAt(x: number, y: number) {
  let element = document.elementFromPoint(x, y) as HTMLElement | null;
  while (element) {
    const rect = element.getBoundingClientRect();
    const overflow = getComputedStyle(element).overflowY;
    if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(overflow)) {
      const delta = y < rect.top + 56 ? -10 : y > rect.bottom - 56 ? 10 : 0;
      if (delta) element.scrollBy({ top: delta, behavior: "auto" });
      return;
    }
    element = element.parentElement;
  }
  if (y < 56) window.scrollBy({ top: -10, behavior: "auto" });
  else if (y > window.innerHeight - 56) window.scrollBy({ top: 10, behavior: "auto" });
}

/** Pointer capture supports mouse, pen and touch; only dropping issues a command. */
export function ProposalMoveHandle({ kind, id, name, disabled, onDrop, onStep, canUp, canDown, onTarget }: {
  kind: "section" | "item"; id: string; name: string; disabled: boolean;
  onDrop: (target: ProposalDrop) => void; onStep: (direction: -1 | 1) => void;
  canUp: boolean; canDown: boolean; onTarget: (target: ProposalDrop | null, source?: string) => void;
}) {
  const cleanup = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => cleanup.current?.(), []);
  React.useEffect(() => { if (disabled) cleanup.current?.(); }, [disabled]);

  function start(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    cleanup.current?.();
    const button = event.currentTarget;
    const root = button.closest("[data-proposal-workspace]");
    const pointerId = event.pointerId;
    const origin = { x: event.clientX, y: event.clientY };
    let point = origin, activated = false, target: ProposalDrop | null = null;
    let frame = 0;
    button.setPointerCapture(pointerId);
    function hitTest() {
      const candidate = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-proposal-drop-kind]");
      target = null;
      if (candidate && root?.contains(candidate)) {
        const targetKind = candidate.dataset.proposalDropKind as "section" | "item";
        const targetId = candidate.dataset.proposalDropId!;
        if ((kind === "item" || targetKind === "section") && !(targetKind === kind && targetId === id)) {
          const rect = candidate.getBoundingClientRect();
          target = { kind: targetKind, id: targetId, placement: kind === "item" && targetKind === "section" ? "inside" :
            point.y < rect.top + rect.height / 2 ? "before" : "after" };
        }
      }
      onTarget(target, id);
    }
    function tick() { if (activated) { scrollAt(point.x, point.y); hitTest(); } frame = requestAnimationFrame(tick); }
    function move(next: PointerEvent) {
      if (next.pointerId !== pointerId) return;
      point = { x: next.clientX, y: next.clientY };
      if (!activated && Math.hypot(point.x - origin.x, point.y - origin.y) < 6) return;
      activated = true; next.preventDefault(); hitTest();
    }
    function stop() {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      button.removeEventListener("lostpointercapture", cancel);
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      cleanup.current = null; onTarget(null);
    }
    function finish(next: PointerEvent) {
      if (next.pointerId !== pointerId) return;
      point = { x: next.clientX, y: next.clientY };
      if (activated) hitTest();
      const destination = target; stop();
      if (activated && destination) onDrop(destination);
    }
    function cancel() { stop(); }
    function key(next: KeyboardEvent) { if (next.key === "Escape") { next.preventDefault(); next.stopImmediatePropagation(); stop(); } }
    cleanup.current = stop;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, { capture: true });
    window.addEventListener("blur", cancel);
    button.addEventListener("lostpointercapture", cancel);
    frame = requestAnimationFrame(tick);
  }

  return <div className={styles.moveControls}>
    <button type="button" className={styles.moveHandle} disabled={disabled} aria-label={`Переместить ${kind === "section" ? "раздел" : "услугу"} «${name}»`} title="Перетащите или используйте стрелки вверх / вниз" onPointerDown={start} onKeyDown={(event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); if (!disabled && (event.key === "ArrowUp" ? canUp : canDown)) onStep(event.key === "ArrowUp" ? -1 : 1); }
    }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" /></svg></button>
    <div className={styles.moveSteps}><button type="button" disabled={disabled || !canUp} aria-label={`Выше: ${name}`} onClick={() => onStep(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg></button><button type="button" disabled={disabled || !canDown} aria-label={`Ниже: ${name}`} onClick={() => onStep(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button></div>
  </div>;
}
