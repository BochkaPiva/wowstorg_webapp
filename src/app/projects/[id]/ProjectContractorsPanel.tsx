"use client";
import React from "react";
import Link from "next/link";
import { ProjectModuleContentSkeleton } from "./ProjectModuleBoundary";
import { catalogRequest, ContractorPhoto, type ContractorCard, type ContractorDetail } from "@/app/contractors/catalog-ui";
import { PROJECT_CONTRACTOR_STATUSES, PROJECT_CONTRACTOR_STATUS_LABEL, type ProjectContractorFields, type ProjectContractorRow, type ProjectContractorsPayload } from "@/lib/projects/project-contractors";
import styles from "./project-contractors.module.css";

const blank: ProjectContractorFields = { name: "", responsibility: "", contactName: null, phone: null, email: null, status: "PENDING", scheduleSlotId: null, arrivalNote: null, internalNotes: null };
function fieldsOf(row: ProjectContractorRow): ProjectContractorFields {
  return Object.fromEntries(Object.keys(blank).map((key) => [key, row[key as keyof ProjectContractorFields]])) as ProjectContractorFields;
}
function RosterForm({ initial, slots, submit, cancel, label, reload }: {
  initial: ProjectContractorFields; slots: ProjectContractorsPayload["scheduleSlots"];
  submit: (fields: ProjectContractorFields) => Promise<void>; cancel: () => void; label: string; reload?: () => Promise<void>;
}) {
  const [draft, setDraft] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  React.useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  React.useEffect(() => {
    const close = (event: Event) => { if (busy || (dirty && !window.confirm("Закрыть форму без сохранения изменений?"))) event.preventDefault(); };
    window.addEventListener("project-contractors:close", close);
    return () => window.removeEventListener("project-contractors:close", close);
  }, [dirty, busy]);
  const text = (key: "name" | "responsibility" | "contactName" | "phone" | "email" | "arrivalNote" | "internalNotes", title: string, multiline = false, max = 200) => (
    <label className={multiline ? styles.wide : undefined}>{title}{multiline
      ? <textarea aria-label={title} rows={key === "responsibility" ? 3 : 2} maxLength={max} value={draft[key] ?? ""} disabled={busy} required={key === "responsibility"} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
      : <input aria-label={title} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} maxLength={max} value={draft[key] ?? ""} disabled={busy} required={key === "name"} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />}</label>
  );
  return <form className={styles.form} aria-label={label} onSubmit={async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try { await submit(draft); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить"); } finally { setBusy(false); }
  }}>
    {text("name", "Подрядчик")}
    <label>Статус<select aria-label="Статус" value={draft.status} disabled={busy} onChange={(event) => setDraft({ ...draft, status: event.target.value as ProjectContractorFields["status"] })}>{PROJECT_CONTRACTOR_STATUSES.map((status) => <option key={status} value={status}>{PROJECT_CONTRACTOR_STATUS_LABEL[status]}</option>)}</select></label>
    {text("responsibility", "За что отвечает", true, 3000)}
    {text("contactName", "Контактное лицо")}{text("phone", "Телефон", false, 80)}{text("email", "Email")}
    <label>Пункт тайминга<select aria-label="Пункт тайминга" value={draft.scheduleSlotId ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, scheduleSlotId: event.target.value || null })}>
      <option value="">Без привязки</option>{draft.scheduleSlotId && !slots.some((slot) => slot.id === draft.scheduleSlotId) ? <option value={draft.scheduleSlotId}>Пункт удалён — выберите другой</option> : null}
      {slots.map((slot) => <option value={slot.id} key={slot.id}>{slot.label}</option>)}
    </select>{!slots.length ? <small>Сначала добавьте и сохраните пункты в блоке «Тайминг».</small> : null}</label>
    {text("arrivalNote", "Когда и куда прибыть", true, 1000)}{text("internalNotes", "Договорённости для команды", true, 5000)}
    {error ? <div className={styles.error} role="alert">{error}<small>Введённые поля остались в форме. При конфликте обновите список и сверьте изменения.</small>{reload ? <button type="button" className={styles.quiet} disabled={busy} onClick={() => void reload()}>Обновить список</button> : null}</div> : null}
    <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => { if (!dirty || window.confirm("Закрыть без сохранения изменений?")) cancel(); }}>Отмена</button><button className={styles.primary} disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button></div>
  </form>;
}
function Assignment({ row, slots, readOnly, refresh, projectId }: { row: ProjectContractorRow; slots: ProjectContractorsPayload["scheduleSlots"]; readOnly: boolean; refresh: () => Promise<void>; projectId: string }) {
  const [editing, setEditing] = React.useState(false);
  const [editSnapshot, setEditSnapshot] = React.useState(row);
  return <article className={styles.row} data-cancelled={row.status === "CANCELLED" || undefined}>
    <div className={styles.person}>
      <div className={styles.photo}><ContractorPhoto src={row.photoUrl} name={row.name} /></div>
      <div className={styles.personCopy}><div className={styles.nameLine}><h3>{row.name}</h3><span className={styles.status} data-status={row.status}>{PROJECT_CONTRACTOR_STATUS_LABEL[row.status]}</span></div>
        <p className={styles.responsibility}>{row.responsibility}</p>
        <div className={styles.contacts}>{row.contactName ? <span>{row.contactName}</span> : null}{row.phone ? <a href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}>{row.phone}</a> : null}{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : null}{!row.phone && !row.email ? <span className={styles.missing}>Контакт ещё не указан</span> : null}</div>
        {row.scheduleLabel || row.arrivalNote ? <div className={styles.arrival}>{row.scheduleLabel ? <span>Тайминг: {row.scheduleLabel}</span> : null}{row.arrivalNote ? <span>{row.arrivalNote}</span> : null}</div> : null}
        {row.internalNotes ? <details className={styles.notes}><summary>Договорённости</summary><p>{row.internalNotes}</p></details> : null}
      </div>
      {!readOnly && !editing ? <button className={styles.quiet} type="button" aria-label={`Изменить: ${row.name}`} onClick={() => { setEditSnapshot(row); setEditing(true); }}>Изменить</button> : null}
    </div>
    {editing && !readOnly ? <div className={styles.editor}>
      {editSnapshot.revision !== row.revision ? <p role="status" className={styles.error}>Коллега изменил эту запись. Закройте форму, сверьте актуальные данные и откройте её заново.</p> : null}
      <RosterForm initial={fieldsOf(editSnapshot)} slots={slots} label={`Изменить ${row.name}`} reload={refresh} cancel={() => setEditing(false)} submit={async (fields) => {
        await catalogRequest(`/api/projects/${projectId}/contractors/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, expectedRevision: editSnapshot.revision }) });
        setEditing(false); await refresh();
      }} />
    </div> : null}
  </article>;
}
function AddContractor({ projectId, slots, done, cancel }: { projectId: string; slots: ProjectContractorsPayload["scheduleSlots"]; done: () => Promise<void>; cancel: () => void }) {
  const [query, setQuery] = React.useState("");
  const [cards, setCards] = React.useState<ContractorCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<{ id: string | null; fields: ProjectContractorFields } | null>(null);
  const [requestId] = React.useState(() => crypto.randomUUID());
  const [selecting, setSelecting] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (selection) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError(null);
      catalogRequest<{ contractors: ContractorCard[] }>(`/api/contractors?paged=1&limit=12&search=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((data) => { setCards(data.contractors); setLoading(false); }).catch((cause) => { if (!controller.signal.aborted) { setError(cause.message); setLoading(false); } });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, selection]);
  if (selection) return <div className={styles.composer}><h3>{selection.id ? "Добавить в проект" : "Подрядчик вне каталога"}</h3><RosterForm initial={selection.fields} slots={slots} label="Добавление подрядчика" cancel={cancel} submit={async (fields) => {
    await catalogRequest(`/api/projects/${projectId}/contractors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, id: requestId, contractorId: selection.id, action: "ADD" }) }); await done();
  }} /></div>;
  return <div className={styles.composer}>
    <div className={styles.toolbar}><h3>Кто участвует в проекте?</h3><button type="button" className={styles.quiet} onClick={cancel}>Закрыть</button></div>
    <div className={styles.searchLine}><input type="search" autoFocus placeholder="Найти подрядчика" aria-label="Найти подрядчика для проекта" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" className={styles.secondary} onClick={() => setSelection({ id: null, fields: blank })}>Вне каталога</button></div>
    {error ? <p className={styles.error} role="alert">{error}<button type="button" className={styles.quiet} onClick={() => setQuery((value) => value + " ")}>Повторить</button></p> : null}
    {loading ? <ProjectModuleContentSkeleton /> : <div className={styles.picker}>{cards.map((card) => <button type="button" key={card.id} disabled={selecting !== null} onClick={async () => {
      setSelecting(card.id); setError(null);
      try {
        const data = await catalogRequest<{ contractor: ContractorDetail }>(`/api/contractors/${card.id}`);
        const detail = data.contractor, contact = detail.contacts[0];
        setSelection({ id: card.id, fields: { ...blank, name: card.name, responsibility: card.shortDescription || card.offers.map((offer) => offer.title).slice(0, 3).join(", "), contactName: contact?.personName || null, phone: contact?.phone || null, email: contact?.email || null } });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить контакт"); } finally { setSelecting(null); }
    }}><span className={styles.photo}><ContractorPhoto src={card.photoUrl} name={card.name} /></span><span><strong>{card.name}</strong><small>{selecting === card.id ? "Открываем…" : card.offers.map((offer) => offer.title).slice(0, 2).join(" · ") || card.shortDescription || "Контакт из каталога"}</small></span><span aria-hidden>+</span></button>)}{!cards.length && !error ? <p>Ничего не найдено. Измените поиск или добавьте контакт вне каталога.</p> : null}</div>}
    <small className={styles.help}>Показываем до 12 совпадений. Уточните имя или услугу.</small>
  </div>;
}
export function ProjectContractorsPanel({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const instanceId = React.useId();
  const [data, setData] = React.useState<ProjectContractorsPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"add" | "import" | null>(null);
  const [variantId, setVariantId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const refresh = React.useCallback(async () => {
    try { const result = await catalogRequest<ProjectContractorsPayload>(`/api/projects/${projectId}/contractors`); setData(result); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить состав"); }
  }, [projectId]);
  React.useEffect(() => {
    void refresh();
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; source?: string }>).detail;
      if ((!detail?.projectId || detail.projectId === projectId) && detail?.source !== instanceId) void refresh();
    };
    window.addEventListener("project-contractors-changed", listener);
    return () => window.removeEventListener("project-contractors-changed", listener);
  }, [refresh, projectId, instanceId]);
  const publishChange = async () => { await refresh(); window.dispatchEvent(new CustomEvent("project-contractors-changed", { detail: { projectId, source: instanceId } })); };
  const afterChange = async () => { setMode(null); await publishChange(); };
  if (!data && !error) return <ProjectModuleContentSkeleton />;
  const active = data?.assignments.filter((row) => row.status !== "CANCELLED") ?? [];
  const confirmed = active.filter((row) => row.status === "CONFIRMED" || row.status === "DONE").length;
  const variants = data?.proposal?.variants ?? [];
  const selected = variants.find((variant) => variant.id === variantId);
  return <section className={styles.panel} aria-label="Состав подрядчиков проекта">
    <div className={styles.toolbar}><div><h2>Команда мероприятия</h2><p>{active.length ? `${active.length} в составе · ${confirmed} подтверждено · ${active.length - confirmed} на согласовании` : "Кто делает мероприятие и о чём договорились"}</p></div>
      {!readOnly && data && !mode ? <div className={styles.actions}><button className={styles.secondary} type="button" onClick={async () => { setVariantId(variants.find((variant) => variant.isRecommended)?.id || variants[0]?.id || ""); setMode("import"); await refresh(); }}>Из КП</button><button className={styles.primary} type="button" onClick={() => { setNotice(null); setMode("add"); }}>+ Подрядчик</button></div> : null}
    </div>
    {error ? <div className={styles.error} role="alert">{error}<button className={styles.quiet} type="button" onClick={() => void refresh()}>Обновить список</button></div> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {mode === "add" && data ? <AddContractor projectId={projectId} slots={data.scheduleSlots} done={afterChange} cancel={() => setMode(null)} /> : null}
    {mode === "import" && data ? <div className={styles.composer}><div className={styles.toolbar}><h3>Состав из выбранного КП</h3><button type="button" className={styles.quiet} disabled={busy} onClick={() => setMode(null)}>Закрыть</button></div>
      {variants.length ? <><label className={styles.variant}>Вариант<select value={variantId} disabled={busy} onChange={(event) => setVariantId(event.target.value)}><option value="">Выберите вариант</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.title} · {variant.contractorCount} подрядчиков</option>)}</select></label><p className={styles.help}>Добавим только подрядчиков основных услуг со статусом «На согласовании». Существующие записи и договорённости не изменятся. Цены останутся в КП и смете.</p><button type="button" className={styles.primary} disabled={busy || !selected?.contractorCount} onClick={async () => {
        if (!data.proposal || !selected || busy) return; setBusy(true); setError(null);
        try { const result = await catalogRequest<{ added: number; skipped: number }>(`/api/projects/${projectId}/contractors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "IMPORT_PROPOSAL", variantId, expectedProposalRevision: data.proposal.revision }) }); setNotice(`Добавлено: ${result.added}. Уже в составе: ${result.skipped}.`); await afterChange(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось перенести состав"); } finally { setBusy(false); }
      }}>{busy ? "Добавляем…" : "Добавить состав"}</button></> : <p>Сначала соберите КП для этого проекта. <Link href={`/projects/${projectId}#project-widget-event-builder`}>К конструктору</Link></p>}
    </div> : null}
    {data ? <div className={styles.list}>{data.assignments.map((row) => <Assignment key={row.id} row={row} projectId={projectId} slots={data.scheduleSlots} readOnly={readOnly} refresh={publishChange} />)}</div> : null}
    {data && !data.assignments.length && !mode ? <div className={styles.empty}><strong>Состав ещё не собран</strong><p>Перенесите основных подрядчиков из КП или добавьте нужных людей. Здесь коллега увидит обязанности, контакты и время прибытия.</p></div> : null}
  </section>;
}
