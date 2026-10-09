"use client";

import React from "react";
import { CatalogDialog } from "@/app/contractors/CatalogDialog";
import { ContractorPhoto, catalogRequest } from "@/app/contractors/catalog-ui";
import type { ProjectFreeBoardLinkable, ProjectFreeBoardLinkedItemType } from "@/lib/projects/project-free-board";
import type { ProjectContractorsPayload } from "@/lib/projects/project-contractors";
import { PROJECT_CONTRACTOR_STATUS_LABEL } from "@/lib/projects/project-contractors";
import { fieldsOf, RosterForm } from "./ProjectContractorsPanel";
import { ProjectModuleContentSkeleton } from "./ProjectModuleBoundary";
import styles from "./project-contractors.module.css";

const MODULE = { TASK: "TASKS", ORDER: "ORDERS", FILE: "FILES", ESTIMATE_SECTION: "ESTIMATE", CONTRACTOR: "CONTRACTORS", CONTACT: "CONTACTS", SCHEDULE_SLOT: "SCHEDULE", PROPOSAL: "EVENT_BUILDER" } as const;

export function ProjectBoardEntityDetails({ projectId, type, entity, readOnly, onClose }: {
  projectId: string; type: ProjectFreeBoardLinkedItemType; entity: ProjectFreeBoardLinkable; readOnly: boolean; onClose: () => void;
}) {
  const [roster, setRoster] = React.useState<ProjectContractorsPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const close = () => { if (window.dispatchEvent(new Event("project-contractors:close", { cancelable: true }))) onClose(); };
  React.useEffect(() => {
    if (type !== "CONTRACTOR") return;
    const controller = new AbortController();
    void catalogRequest<ProjectContractorsPayload>(`/api/projects/${projectId}/contractors`, { signal: controller.signal }).then(setRoster).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [projectId, type]);
  const row = roster?.assignments.find((candidate) => candidate.id === entity.id);
  return <CatalogDialog label={`Объект проекта: ${entity.label}`} onClose={close}><section className={styles.panel} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className={styles.toolbar}><h2>{row?.name || entity.label}</h2><button type="button" className={styles.secondary} onClick={close}>Закрыть</button></div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {type === "CONTRACTOR" && !roster && !error ? <ProjectModuleContentSkeleton /> : editing && row && roster && !readOnly ? <RosterForm initial={fieldsOf(row)} slots={roster.scheduleSlots} label={`Изменить ${row.name} на доске`} cancel={() => setEditing(false)} submit={async (fields) => {
      await catalogRequest(`/api/projects/${projectId}/contractors/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, expectedRevision: row.revision }) });
      setRoster(await catalogRequest<ProjectContractorsPayload>(`/api/projects/${projectId}/contractors`)); setEditing(false);
      window.dispatchEvent(new CustomEvent("project-contractors-changed", { detail: { projectId } }));
    }} /> : <>
      {type === "CONTRACTOR" && roster && !row ? <p className={styles.error}>Участие больше недоступно. Карточку можно убрать с доски; это не удаляет данные проекта.</p> : null}
      <div className={styles.person}>{entity.photoUrl ? <div className={styles.photo}><ContractorPhoto src={entity.photoUrl} name={entity.label} /></div> : null}<div className={styles.personCopy}><p className={styles.help}>{row ? `${row.categoryNames?.join(" · ") || "Без категории"} · ${PROJECT_CONTRACTOR_STATUS_LABEL[row.status]}` : entity.meta}</p><p className={styles.responsibility}>{row?.responsibility ?? entity.description}</p><div className={styles.contacts}>{row?.contactName ? <span>{row.contactName}</span> : null}{(row?.phone ?? entity.phone) ? <a href={`tel:${(row?.phone ?? entity.phone)!.replace(/[^+\d]/g, "")}`}>{row?.phone ?? entity.phone}</a> : null}{(row?.email ?? entity.email) ? <a href={`mailto:${row?.email ?? entity.email}`}>{row?.email ?? entity.email}</a> : null}</div></div></div>
      {row?.scheduleLabel ? <p className={styles.arrival}>Тайминг: {row.scheduleLabel}</p> : null}{row?.arrivalNote ? <p className={styles.responsibility}>{row.arrivalNote}</p> : null}{row?.internalNotes ? <div className={styles.empty}><strong>Договорённости для команды</strong><p>{row.internalNotes}</p></div> : null}
      <div className={styles.actions}>{row && !readOnly ? <button type="button" className={styles.primary} onClick={() => setEditing(true)}>Изменить участие</button> : null}<button type="button" className={styles.secondary} onClick={() => {
        const accepted = window.dispatchEvent(new CustomEvent("project-workspace:open", { cancelable: true, detail: { projectId, type: MODULE[type], returnToBoard: true } }));
        if (accepted) onClose(); else setError("Этот блок не подключён к карточке. Добавьте его через «Настроить карточку».");
      }}>Открыть блок проекта</button>{type === "ORDER" ? <a className={styles.quiet} href={entity.href}>Открыть заявку</a> : null}</div>
    </>}
  </section></CatalogDialog>;
}
