"use client";
import React from "react";
import Link from "next/link";
import { ContextPopover } from "@/app/_ui/ContextPopover";
import styles from "./requisite-actions.module.css";

export function RequisiteActions({ orderId, readOnly, saving, busy, dirty, canSave, onSave, onRemove, onMove, canMoveUp, canMoveDown }: {
  orderId: string; readOnly: boolean; saving: boolean; busy: boolean; dirty: boolean; canSave: boolean;
  onSave: () => void; onRemove: () => void; onMove?: (direction: -1 | 1) => void; canMoveUp?: boolean; canMoveDown?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
  const stop = (event: React.MouseEvent) => { event.preventDefault(); event.stopPropagation(); };
  return <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
    {!readOnly && (dirty || saving) && canSave ? <button type="button" className={styles.save} disabled={saving || busy} onClick={(event) => { stop(event); onSave(); }}>{saving ? "Сохраняем…" : "Сохранить"}</button> : null}
    <button type="button" className={styles.more} disabled={saving || busy} aria-label="Действия со связанной заявкой" aria-expanded={open} title="Действия с заявкой" onClick={(event) => { stop(event); setAnchor(event.currentTarget); setOpen((value) => !value); }}><svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg></button>
    {open ? <ContextPopover anchor={anchor} preferredWidth={230} preferredHeight={190} label="Действия со связанной заявкой" className={styles.menu} onClose={() => setOpen(false)}>
      <Link href={`/orders/${orderId}`} onClick={(event) => { event.stopPropagation(); setOpen(false); }}>Открыть заявку</Link>
      {!readOnly && onMove ? <><button type="button" disabled={!canMoveUp} onClick={(event) => { stop(event); setOpen(false); onMove(-1); }}>Выше в смете</button><button type="button" disabled={!canMoveDown} onClick={(event) => { stop(event); setOpen(false); onMove(1); }}>Ниже в смете</button></> : null}
      {!readOnly ? <button type="button" className={styles.danger} onClick={(event) => { stop(event); setOpen(false); onRemove(); }}>Убрать из сметы</button> : null}
    </ContextPopover> : null}
  </div>;
}
