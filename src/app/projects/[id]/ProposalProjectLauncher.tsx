"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import React from "react";
import { LoadingRegion, Skeleton } from "@/app/_ui/Skeleton";
import { proposalRequest } from "@/app/proposals/api";
import { PROPOSAL_STATUS, proposalMoney, proposalTotals, type Proposal } from "@/lib/proposals";
import styles from "@/app/proposals/proposals.module.css";

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
  const totals = proposalTotals(variant?.sections.flatMap((section) => section.items) ?? []);
  return <div className={`${styles.page} p-6`}>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    <div className={styles.heading}><div><h2 className="m-0 text-2xl font-bold">{proposal?.title ?? "Соберите предложение для клиента"}</h2><p>{proposal ? `${PROPOSAL_STATUS[proposal.status]} · ${proposal.variants.length} вариантов · ${variant?.sections.length ?? 0} разделов` : "Подберите услуги и подготовьте КП прямо здесь, на весь экран."}</p></div>{proposal ? <button className={styles.primary} onClick={() => onExpand ? onExpand() : router.push(`/proposals/${proposal.id}`)}>Открыть конструктор КП</button> : <button className={styles.primary} disabled={busy || readOnly} onClick={() => void open()}>{busy ? "Открываем…" : "Составить КП"}</button>}</div>
    {proposal ? <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2"><strong className="text-2xl tabular-nums">{totals.preliminary ? "от " : ""}{proposalMoney(totals.client)}</strong><span className="text-sm text-zinc-600">{totals.unresolved ? `${totals.unresolved} цен требуют уточнения` : "Основной вариант"}</span><span className="text-sm text-zinc-600">{variant?.sections.map((section) => section.title).join(" · ") || "Добавьте первый раздел в конструкторе"}</span></div> : null}
  </div>;
}
