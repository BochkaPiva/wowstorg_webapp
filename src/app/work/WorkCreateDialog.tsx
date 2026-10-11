"use client";

import Link from "next/link";
import React from "react";
import { WORK_CREATE, type WorkCreateKind } from "@/lib/work-create";

export function WorkCreateDialog({ kind, title, onTitle, customerField, customerValid, busy, error, onSubmit, onClose }: {
  kind: WorkCreateKind; title: string; onTitle: (title: string) => void; customerField: React.ReactNode;
  customerValid: boolean; busy: boolean; error: string | null; onSubmit: React.FormEventHandler<HTMLFormElement>; onClose: () => void;
}) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const config = WORK_CREATE[kind];
  React.useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    element.querySelector<HTMLInputElement>('input')?.focus();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="work-createDialog" aria-labelledby="work-create-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={onSubmit} aria-busy={busy}>
      <div className="work-createDialog__heading"><h2 id="work-create-title">{config.title}</h2><button type="button" aria-label="Закрыть создание" disabled={busy} onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <p>{config.description}</p>
      <label className="work-createDialog__field"><span>Название мероприятия</span><input autoFocus required minLength={2} maxLength={200} value={title} onChange={event => onTitle(event.target.value)} placeholder="Например, осенний корпоратив" disabled={busy} /></label>
      {customerField}
      <small>{kind === "project" ? "Ответственный — вы. Дату и участников можно указать в карточке." : "Даты и подробности можно уточнить позже. Черновик сохраняется отдельно."}</small>
      {error ? <div className="work-createDialog__error" role="alert">{error} <Link href={config.list}>Открыть список</Link></div> : null}
      <div className="work-createDialog__actions"><button type="button" disabled={busy} onClick={onClose}>Отмена</button><button type="submit" className="work-launch__button work-launch__button--primary" disabled={busy || title.trim().length < 2 || !customerValid}>{busy ? "Создаём…" : config.submit}</button></div>
    </form>
  </dialog>;
}
