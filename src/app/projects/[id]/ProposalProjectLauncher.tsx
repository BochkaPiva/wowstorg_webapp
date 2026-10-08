"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import React from "react";
import { LoadingRegion, Skeleton } from "@/app/_ui/Skeleton";
import { proposalRequest } from "@/app/proposals/api";
import { PROPOSAL_STATUS, type Proposal } from "@/lib/proposals";
import { proposalCount, proposalVariantSummary } from "@/lib/proposal-summary";
import styles from "@/app/proposals/proposals.module.css";
import summaryStyles from "./proposal-project.module.css";

const EmbeddedWorkspace = dynamic(() => import("@/app/proposals/ProposalWorkspace").then(module => module.ProposalWorkspace), {
  loading: () => <LoadingRegion className="p-6"><Skeleton className="block h-48 w-full" /></LoadingRegion>,
});

export function ProjectEventBuilderPanel({ projectId, readOnly, expanded = false, onExpand }: { projectId: string; readOnly: boolean; expanded?: boolean; onExpand?: () => void }) {
  const router = useRouter();
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    const controller = new AbortController();
    void proposalRequest<{ proposal: Proposal | null }>(`/api/projects/${projectId}/proposals`, "GET", undefined, controller.signal)
      .then((data) => setProposal(data.proposal))
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "КП не загрузилось"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId]);
  async function open() {
    if (busy || readOnly) return;
    setBusy(true); setError("");
    try {
      // A colleague may have created the current proposal while this widget was open.
      const existing = await proposalRequest<{ proposal: Proposal | null }>(`/api/projects/${projectId}/proposals`);
      const data = existing.proposal ? existing : await proposalRequest<{ proposal: Proposal }>(`/api/projects/${projectId}/proposals`, "POST", {});
      setProposal(data.proposal);
      if (onExpand) onExpand(); else router.push(`/proposals/${data.proposal!.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать КП"); }
    finally { setBusy(false); }
  }
  if (loading) return <LoadingRegion className="p-6"><Skeleton className="block h-24 w-full" /></LoadingRegion>;
  if (expanded && proposal) return <EmbeddedWorkspace key={proposal.id} proposalId={proposal.id} embedded />;
  const variant = proposal?.variants.find((entry) => entry.isRecommended) ?? proposal?.variants[0];
  const summary = proposalVariantSummary(variant);
  return <div className={summaryStyles.summary} data-proposal-summary>
    {error ? <div className={`${styles.error} ${summaryStyles.error}`} role="alert">{error}</div> : null}
    <div className={summaryStyles.header}>
      <div className={summaryStyles.identity}>
        <div className={summaryStyles.title}><h2>{proposal?.title ?? "Соберите предложение для клиента"}</h2>{proposal ? <span className={summaryStyles.status}>{PROPOSAL_STATUS[proposal.status] ?? proposal.status}</span> : null}</div>
        <p>{proposal ? `${variant?.title ?? "Без варианта"} · ${proposalCount(proposal.variants.length, ["вариант", "варианта", "вариантов"])} · ${proposalCount(summary.sections.length, ["раздел", "раздела", "разделов"])}` : "Выберите услуги, сравните варианты и подготовьте предложение на весь экран."}</p>
      </div>
      {proposal ? <button className={styles.primary} onClick={() => onExpand ? onExpand() : router.push(`/proposals/${proposal.id}`)}>Открыть конструктор КП</button> : <button className={styles.primary} disabled={busy || readOnly} onClick={() => void open()}>{busy ? "Открываем…" : "Составить КП"}</button>}
    </div>
    {proposal ? <div className={summaryStyles.body}>
      <dl className={summaryStyles.sections} aria-label="Состав предложения">
        {summary.sections.slice(0, 3).map(section => <div className={summaryStyles.section} key={section.id}><dt>{section.title}</dt><dd>{section.selected.length ? `${section.selected.slice(0, 2).join(" · ")}${section.selected.length > 2 ? ` · ещё ${section.selected.length - 2}` : ""}` : section.hasCandidates ? "Основной состав ещё не выбран" : "Услуги ещё не подобраны"}</dd></div>)}
        {!summary.sections.length ? <div className={summaryStyles.section}><dt>Состав</dt><dd>Добавьте первый раздел в конструкторе</dd></div> : null}
        {summary.sections.length > 3 ? <div className={summaryStyles.section}><dt>Ещё {summary.sections.length - 3}</dt><dd>{summary.sections.slice(3).map(section => section.title).join(" · ")}</dd></div> : null}
      </dl>
      <section className={summaryStyles.budget} aria-label="Бюджет предложения">
        <h3>Бюджет основного состава</h3><strong>{summary.budget.label}</strong>
        <p className={summary.budget.unresolved ? summaryStyles.pending : undefined}>{summary.budget.detail}</p>
        {summary.budget.primaryCount ? <p>{proposalCount(summary.budget.primaryCount, ["услуга включена", "услуги включены", "услуг включено"])}</p> : null}
        {summary.alternatives || summary.options ? <p>{[summary.alternatives ? proposalCount(summary.alternatives, ["альтернатива", "альтернативы", "альтернатив"]) : "", summary.options ? proposalCount(summary.options, ["опция", "опции", "опций"]) : ""].filter(Boolean).join(" · ")} — отдельно от суммы</p> : null}
      </section>
    </div> : null}
  </div>;
}
