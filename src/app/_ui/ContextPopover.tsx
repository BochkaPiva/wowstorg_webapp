"use client";

import React from "react";
import { popoverPosition } from "@/lib/popover-position";

/** Native top layer escapes clipping while retaining the fullscreen editor's DOM/focus scope. */
export function ContextPopover({ anchor, label, onClose, children, className, dismissOutside = true, surfaceRef, onChangeCapture }: {
  anchor?: HTMLElement | null; label: string; onClose: () => void; children: React.ReactNode;
  className: string; dismissOutside?: boolean; surfaceRef?: React.RefObject<HTMLElement | null>;
  onChangeCapture?: React.FormEventHandler<HTMLDivElement>;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useRef(onClose);
  React.useLayoutEffect(() => { close.current = onClose; });
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (surfaceRef) surfaceRef.current = node;
    const previous = document.activeElement as HTMLElement | null;
    const viewport = window.visualViewport;
    const place = () => {
      const topbar = (anchor ?? node).closest(".project-workspace-widget--overlay")?.querySelector(".project-workspace-widget__header") ?? document.querySelector(".app-topbar");
      const headerBottom = Math.max(0, topbar?.getBoundingClientRect().bottom ?? 0);
      const position = popoverPosition({ width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight, top: headerBottom }, anchor?.getBoundingClientRect());
      Object.assign(node.style, { left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px`, maxHeight: `${position.maxHeight}px` });
    };
    node.showPopover(); place();
    (node.querySelector<HTMLElement>("input:not([type=checkbox]),textarea") ?? node.querySelector<HTMLElement>("button") ?? node).focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (dismissOutside && !node.contains(event.target as Node) && !anchor?.contains(event.target as Node)) close.current(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopImmediatePropagation(); close.current(); } };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    viewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      viewport?.removeEventListener("resize", place);
      if (node.matches(":popover-open")) node.hidePopover();
      if (surfaceRef?.current === node) surfaceRef.current = null;
      if (previous?.isConnected && (node.contains(document.activeElement) || document.activeElement === document.body)) previous.focus({ preventScroll: true });
    };
  }, [anchor, dismissOutside, surfaceRef]);
  return <div ref={ref} popover="manual" role="dialog" aria-label={label} tabIndex={-1} className={className} onChangeCapture={onChangeCapture}>{children}</div>;
}
