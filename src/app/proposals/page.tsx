"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { useJsonResource } from "@/lib/use-json-resource";
import { AppShell } from "@/app/_ui/AppShell";
import { SectionHeader } from "@/app/_ui/SectionHeader";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";
import { PROPOSAL_STATUS, proposalMoney } from "@/lib/proposals";
import { proposalRequest } from "./api";
import styles from "./proposals.module.css";
import { offerPrice, type ContractorDetail, type Offer } from "@/app/contractors/catalog-ui";

type ProposalListItem = {
  id: string; title: string; status: string; updatedAt: string;
  owner: { type: "PROJECT"; title: string } | { type: "STANDALONE"; customer: { name: string } | null; leadCustomerName: string | null };
  summary: { knownTotal: number; unresolvedCount: number; preliminary: boolean; sectionCount: number; variantCount: number };
};

export default function ProposalsPage() {
  return <React.Suspense fallback={<ListSkeleton />}><ProposalsPageInner /></React.Suspense>;
}

function ProposalsPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { state } = useAuth();
  const allowed = state.status === "authenticated" && state.user.role === "WOWSTORG";
  const [busy, setBusy] = React.useState(false);
  const [actionError, setError] = React.useState("");
  const [creating, setCreating] = React.useState(() => params.get("new") === "1");
  const [scope, setScope] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const proposals = useJsonResource<{ proposals: ProposalListItem[] }>(allowed ? `/api/proposals?scope=${scope}` : null, "Ошибка загрузки");
  const items = proposals.data?.proposals ?? [];
  const loading = proposals.loading;
  const error = actionError || proposals.error || "";
  async function load() { setError(""); await proposals.refresh(); }
  const offerId = params.get("seedOfferId"), contractorId = params.get("contractorId");
  const seedSource = JSON.stringify([offerId, contractorId]);
  const [dismissedSeed, setDismissedSeed] = React.useState<string | null>(null);
  const seedRemoved = dismissedSeed === seedSource;
  const seedResource = useJsonResource<{ contractor: ContractorDetail }>(
    allowed && !seedRemoved && offerId && contractorId ? `/api/contractors/${encodeURIComponent(contractorId)}` : null,
    "Не удалось загрузить услугу",
  );
  const seedOffer: Offer | undefined = seedResource.data?.contractor.offers.find((entry) => entry.id === offerId);
  const seed = !seedRemoved && seedOffer && seedResource.data ? { contractor: seedResource.data.contractor.name, offer: seedOffer } : null;
  const seedLoading = seedResource.loading;
  const seedError = seedRemoved || !offerId ? "" : !contractorId
    ? "Услуга не найдена. Вернитесь в каталог и выберите её ещё раз."
    : seedResource.error || (seedResource.data && !seedOffer ? "Услуга больше не доступна. Выберите другую в каталоге." : "");
  const removeSeed = () => setDismissedSeed(seedSource);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || seedLoading || seedError) return;
    const data = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const result = await proposalRequest<{ proposal: { id: string } }>("/api/proposals", "POST", {
        title: data.get("title"), ...(data.get("customer") ? { customerName: data.get("customer") } : {}),
        ...(seed ? { seedOfferId: seed.offer.id } : {}),
      });
      router.push(`/proposals/${result.proposal.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать КП"); setBusy(false); }
  }
  const filtered = items.filter((item) => `${item.title} ${item.owner.type === "PROJECT" ? item.owner.title : item.owner.customer?.name ?? item.owner.leadCustomerName ?? ""}`.toLocaleLowerCase("ru-RU").includes(search.trim().toLocaleLowerCase("ru-RU")));
  return <AppShell title="Коммерческие предложения" backHref="/contractors">
    <div className={styles.page}>
      <SectionHeader title="Коммерческие предложения" description="Соберите мероприятие сейчас. Создайте проект, когда клиент будет готов." mascot="projects" actions={!creating ? <button type="button" disabled={busy} onClick={() => setCreating(true)}>Составить КП</button> : undefined} links={<><Link href="/contractors">Каталог подрядчиков</Link><Link href="/work">Рабочая очередь</Link></>} />
      {creating && (seed || seedLoading || seedError) ? <div className={styles.seedContext} role="status">{seedLoading ? "Подготавливаем выбранную услугу…" : seedError ? <>{seedError} <Link href="/contractors">Вернуться в каталог</Link> <button className={styles.quiet} onClick={removeSeed}>Начать пустое КП</button></> : seed ? <><strong>{seed.offer.title}</strong><span>{seed.contractor} · {offerPrice(seed.offer)}</span><span>Добавим в раздел «{seed.offer.category.name}». Цену и состав можно изменить в КП.</span><button className={styles.quiet} onClick={removeSeed}>Убрать услугу</button></> : null}</div> : null}
      {creating ? <form className={styles.createForm} onSubmit={create}>
        <label>Название мероприятия<input name="title" disabled={busy} required minLength={2} maxLength={200} placeholder="Например, корпоратив в декабре" autoFocus /></label>
        <label>Заказчик (необязательно)<input name="customer" disabled={busy} minLength={2} maxLength={200} placeholder="Компания или имя клиента" /></label>
        <button className={styles.primary} disabled={busy || seedLoading || Boolean(seedError)}>{busy ? "Создаём…" : "Начать сборку"}</button>
        <button className={styles.quiet} type="button" disabled={busy} onClick={() => setCreating(false)}>Отмена</button>
      </form> : null}
      {error ? <div className={styles.error} role="alert">{error} <button onClick={() => void load()}>Повторить загрузку</button></div> : null}
      <div className={styles.filters}><input aria-label="Найти КП" placeholder="Найти по названию или заказчику" value={search} onChange={(event) => setSearch(event.target.value)} /><div className={styles.tabs}>{[["all", "Все"], ["standalone", "Без проекта"], ["project", "В проектах"]].map(([value, label]) => <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>)}</div></div>
      {loading ? <ListSkeleton /> : filtered.length ? <div className={styles.list}>
        {filtered.map((item) => <Link key={item.id} href={`/proposals/${item.id}`} className={styles.listRow}>
          <div><h2>{item.title}</h2><p>{item.owner.type === "PROJECT" ? `Проект · ${item.owner.title}` : item.owner.customer?.name ?? item.owner.leadCustomerName ?? "Без проекта"}</p></div>
          <div className={styles.listMeta}><span>{PROPOSAL_STATUS[item.status] ?? item.status}</span><span>{item.summary.variantCount} вариантов · {new Date(item.updatedAt).toLocaleDateString("ru-RU")}</span></div>
          <div className={styles.listPrice}><strong>{item.summary.preliminary ? "от " : ""}{proposalMoney(item.summary.knownTotal)}</strong><span>{item.summary.unresolvedCount ? `${item.summary.unresolvedCount} цен по запросу` : item.summary.sectionCount ? "Основной вариант" : "Пока без услуг"}</span></div>
        </Link>)}
      </div> : !error && !creating ? <div className={styles.empty}><h2>{search ? "КП не найдено" : "От первого звонка — к предложению"}</h2><p>{search ? "Попробуйте другое название." : "Для начала достаточно названия. Подрядчиков и цены добавите в рабочем пространстве."}</p>{!search ? <button className={styles.primary} onClick={() => setCreating(true)}>Составить первое КП</button> : null}</div> : null}
      <p className={styles.footnote}>Показаны последние 100 КП. Суммы разных вариантов не складываются.</p>
    </div>
  </AppShell>;
}
