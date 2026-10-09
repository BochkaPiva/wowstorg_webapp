"use client";

import React from "react";
import styles from "./contractors.module.css";

/** Same catalog detail pattern as ItemModal: protected overlay, photo/content, bounded scroll. */
export function CatalogDialog({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => { node.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={styles.detailDialog} aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }} onPointerDown={(event) => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  }}><div className={styles.dialogContent}>{children}</div></dialog>;
}
