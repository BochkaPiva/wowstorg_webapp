"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { readJsonSafe } from "@/lib/fetchJson";

type Tier = { id?: string; name: string; minScore: number; discountPercent: number; sortOrder: number };
type Policy = {
  startingScore: number;
  confirmationResponseReward: number;
  repeatMissedPenalty: number;
  finalMissedPenalty: number;
  overduePenaltyPerDay: number;
  overduePenaltyCap: number;
  perfectReturnReward: number;
  repairPenaltyPerUnit: number;
  lostPenaltyPerUnit: number;
  incidentPenaltyCap: number;
  approvalLeadDays: number;
  approvalWarningDays: number;
  approvalMissedPenalty: number;
  reminderHourOmsk: number;
  recoveryGraceDays: number;
  recoveryDurationDays: number;
  tiers: Tier[];
};

type LoyaltyData = {
  policy: Policy;
  users: Array<{
    id: string;
    displayName: string;
    login: string;
    isActive: boolean;
    telegramChatId: string | null;
    greenwichRating: { baseScore: number; score: number; updatedAt: string } | null;
    month: { position: number; monthlyDelta: number; perfectReturns: number; penalties: number } | null;
  }>;
  leaderboard: Array<{ userId: string; displayName: string; position: number; monthlyDelta: number; currentScore: number }>;
  offers: Array<{
    id: string;
    title: string;
    description: string | null;
    discountPercent: number;
    startsAt: string;
    endsAt: string;
    isActive: boolean;
    user: { displayName: string };
    items: Array<{ id: string; name: string; photo1Key: string | null }>;
  }>;
  events: Array<{
    id: string;
    type: string;
    delta: number;
    reason: string;
    createdAt: string;
    user: { displayName: string };
    order: { eventName: string | null; customer: { name: string } } | null;
  }>;
  reminders: {
    counts: Record<string, number>;
    recent: Array<{
      id: string;
      status: string;
      kind: string;
      sentAt: string | null;
      lastError: string | null;
      updatedAt: string;
      recipient: { displayName: string } | null;
      order: { eventName: string | null; customer: { name: string } };
    }>;
  };
  items: Array<{ id: string; name: string; photo1Key: string | null; pricePerDay: number }>;
};

type Tab = "people" | "offers" | "rules" | "history";
type ApiErrorPayload = { error?: { message?: string } | string };

function getApiError(payload: ApiErrorPayload | null, fallback: string): string {
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error?.message) return payload.error.message;
  return fallback;
}

const numberFields: Array<{ key: keyof Omit<Policy, "tiers">; label: string; hint: string }> = [
  { key: "startingScore", label: "Стартовый рейтинг", hint: "Только для новых сотрудников" },
  { key: "confirmationResponseReward", label: "Ответ на подтверждение", hint: "Поощрение" },
  { key: "repeatMissedPenalty", label: "Пропущен повтор", hint: "Восстанавливаемый штраф" },
  { key: "finalMissedPenalty", label: "Пропущен финал", hint: "Восстанавливаемый штраф" },
  { key: "approvalMissedPenalty", label: "Не согласовано", hint: "Только после предупреждения" },
  { key: "overduePenaltyPerDay", label: "Просрочка / день", hint: "Возврат" },
  { key: "overduePenaltyCap", label: "Потолок просрочки", hint: "Не ниже этого значения" },
  { key: "perfectReturnReward", label: "Идеальный возврат", hint: "Поощрение" },
  { key: "repairPenaltyPerUnit", label: "Ремонт / единица", hint: "Факт приёмки" },
  { key: "lostPenaltyPerUnit", label: "Потеря / единица", hint: "Факт приёмки" },
  { key: "incidentPenaltyCap", label: "Потолок инцидента", hint: "На одну заявку" },
  { key: "approvalLeadDays", label: "Заявка считается ранней", hint: "Дней до выдачи" },
  { key: "approvalWarningDays", label: "Предупредить за", hint: "Дней до выдачи" },
  { key: "reminderHourOmsk", label: "Час напоминаний", hint: "Время Омска" },
  { key: "recoveryGraceDays", label: "Пауза восстановления", hint: "Дней" },
  { key: "recoveryDurationDays", label: "Срок восстановления", hint: "Дней" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 90 ? "bg-emerald-100 text-emerald-800" : score >= 75 ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-900";
  return <span className={`inline-flex min-w-14 justify-center rounded-full px-3 py-1 text-sm font-black ${tone}`}>{score}</span>;
}

export default function LoyaltyAdminPage() {
  const { state } = useAuth();
  const [data, setData] = React.useState<LoyaltyData | null>(null);
  const [policy, setPolicy] = React.useState<Policy | null>(null);
  const [tab, setTab] = React.useState<Tab>("people");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [itemQuery, setItemQuery] = React.useState("");
  const [offer, setOffer] = React.useState({ userId: "", title: "", description: "", discountPercent: 40, startsAt: "", endsAt: "", itemIds: [] as string[] });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/loyalty", { cache: "no-store" });
      const json = await readJsonSafe<LoyaltyData | ApiErrorPayload>(response);
      if (!response.ok) throw new Error(getApiError(json as ApiErrorPayload | null, "Не удалось загрузить центр лояльности"));
      if (!json || !("policy" in json)) throw new Error("Сервер не вернул данные. Попробуйте обновить страницу");
      setData(json);
      setPolicy(json.policy);
      setOffer((current) => ({ ...current, userId: current.userId || json.users.find((user: LoyaltyData["users"][number]) => user.isActive)?.id || "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function post(body: unknown) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/loyalty", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) throw new Error(getApiError(json, "Не удалось сохранить"));
      if (!json) throw new Error("Сервер не подтвердил сохранение. Обновите данные перед повтором");
      setNotice("Сохранено. Новые правила применятся только к будущим событиям и заявкам.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const visibleItems = (data?.items ?? []).filter((item) => item.name.toLowerCase().includes(itemQuery.toLowerCase())).slice(0, 24);

  return (
    <AppShell title="Лояльность Grinvich">
      {forbidden ? <p className="text-sm text-zinc-600">Раздел доступен только Wowstorg.</p> : (
        <div className="mx-auto max-w-7xl pb-16">
          <Link href="/admin" className="mb-5 inline-flex text-sm font-bold text-zinc-600 transition-colors hover:text-zinc-950">← Администрирование</Link>

          <section className="relative grid overflow-hidden rounded-2xl border border-[#ded5ef] bg-[#f7f4fc] text-[#24132f] lg:min-h-[228px] lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="relative z-10 flex flex-col justify-center px-6 py-7 md:px-9">
              <p className="text-sm font-bold text-[#6426cf]">Единый центр Grinvich</p>
              <h2 className="mt-2 max-w-3xl text-3xl font-black tracking-[-0.03em] md:text-4xl">Рейтинг, скидки и предупреждения</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#665970] md:text-base">Здесь видно, почему меняется рейтинг, кто лидирует в этом месяце и какие персональные условия действуют сейчас.</p>
            </div>
            <div className="relative hidden min-h-[228px] bg-[#ffd21f] lg:block" aria-hidden>
              <Image src="/brand/dino-rating-star-cutout.png" alt="" fill sizes="300px" className="object-contain object-bottom p-2 pt-3" priority />
            </div>
          </section>

          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Разделы лояльности">
            {([['people','Команда'],['offers','Предложения'],['rules','Правила'],['history','История и доставка']] as Array<[Tab,string]>).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${tab === id ? "bg-[#6426cf] text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>{label}</button>
            ))}
            <button type="button" onClick={() => void load()} className="ml-auto rounded-full px-4 py-2 text-sm font-bold text-zinc-600 transition-colors hover:bg-white" disabled={loading}>Обновить</button>
          </div>

          {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"><div className="text-sm font-black">Не удалось загрузить данные</div><p className="mt-1 text-sm leading-5">{error}</p><button type="button" onClick={() => void load()} className="mt-3 rounded-lg bg-red-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-red-800">Попробовать снова</button></div>}
          {notice && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
          {loading && !data ? <div className="mt-6 grid gap-3 md:grid-cols-3">{[1,2,3].map((key) => <div key={key} className="h-36 animate-pulse rounded-3xl bg-zinc-100" />)}</div> : null}

          {data && tab === "people" && (
            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
              <section className="rounded-3xl border border-zinc-200 bg-white p-5 md:p-6">
                <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Текущий рейтинг</p><h2 className="mt-1 text-2xl font-black tracking-tight">Команда Grinvich</h2></div><p className="text-xs text-zinc-500">Новые начинают с {data.policy.startingScore}</p></div>
                <div className="mt-5 divide-y divide-zinc-100">
                  {data.users.map((user) => (
                    <div key={user.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div><div className="font-bold text-zinc-950">{user.displayName}</div><div className="mt-1 text-xs text-zinc-500">{user.telegramChatId ? "Telegram подключён" : "Telegram не подключён"} · база {user.greenwichRating?.baseScore ?? data.policy.startingScore}</div></div>
                      <div className="text-sm text-zinc-600">{user.month ? <><span className="font-black text-zinc-950">#{user.month.position}</span> в месяце · {user.month.monthlyDelta > 0 ? "+" : ""}{user.month.monthlyDelta}</> : "Без активности в месяце"}</div>
                      <ScoreBadge score={user.greenwichRating?.score ?? data.policy.startingScore} />
                    </div>
                  ))}
                </div>
              </section>
              <aside className="rounded-3xl bg-[#ffd21f] p-6 text-zinc-950">
                <p className="text-xs font-black uppercase tracking-[0.18em]">Лидер месяца</p>
                {data.leaderboard[0] ? <><div className="mt-8 text-5xl font-black tracking-[-0.05em]">#{data.leaderboard[0].position}</div><h2 className="mt-3 text-2xl font-black">{data.leaderboard[0].displayName}</h2><p className="mt-2 text-sm font-semibold">{data.leaderboard[0].monthlyDelta >= 0 ? "+" : ""}{data.leaderboard[0].monthlyDelta} баллов за активность</p><div className="mt-8 border-t border-black/15 pt-4 text-xs leading-5">Административные корректировки не участвуют. При равенстве важны аккуратные возвраты и меньше штрафов.</div></> : <p className="mt-8 text-sm leading-6">Пока никто не совершил рейтингового действия в этом месяце. Победитель не назначен.</p>}
              </aside>
            </div>
          )}

          {data && tab === "offers" && (
            <div className="mt-6 grid gap-5 xl:grid-cols-[420px_1fr]">
              <section className="rounded-3xl border border-zinc-200 bg-white p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Новое предложение</p><h2 className="mt-1 text-2xl font-black">Одна лучшая скидка</h2><p className="mt-2 text-sm leading-6 text-zinc-600">Если предложение лучше уровня, оно автоматически заменит скидку только для выбранных позиций.</p>
                <div className="mt-5 grid gap-3">
                  <select value={offer.userId} onChange={(event) => setOffer({ ...offer, userId: event.target.value })} className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm"><option value="">Выберите сотрудника</option>{data.users.filter((user) => user.isActive).map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select>
                  <input value={offer.title} onChange={(event) => setOffer({ ...offer, title: event.target.value })} placeholder="Например, Выбор месяца" className="h-11 rounded-xl border border-zinc-300 px-3 text-sm" />
                  <textarea value={offer.description} onChange={(event) => setOffer({ ...offer, description: event.target.value })} placeholder="Коротко объясните подарок" className="min-h-20 rounded-xl border border-zinc-300 p-3 text-sm" />
                  <label className="text-xs font-bold text-zinc-600">Финальная скидка, %<input type="number" min={1} max={100} value={offer.discountPercent} onChange={(event) => setOffer({ ...offer, discountPercent: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm" /></label>
                  <div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-zinc-600">Начало<input type="datetime-local" value={offer.startsAt} onChange={(event) => setOffer({ ...offer, startsAt: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-zinc-300 px-2 text-xs" /></label><label className="text-xs font-bold text-zinc-600">Окончание<input type="datetime-local" value={offer.endsAt} onChange={(event) => setOffer({ ...offer, endsAt: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-zinc-300 px-2 text-xs" /></label></div>
                  <input value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder="Найти позиции…" className="mt-2 h-11 rounded-xl border border-zinc-300 px-3 text-sm" />
                  <div className="max-h-52 overflow-auto rounded-xl border border-zinc-200 p-2">{visibleItems.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-zinc-50"><input type="checkbox" checked={offer.itemIds.includes(item.id)} onChange={() => setOffer((current) => ({ ...current, itemIds: current.itemIds.includes(item.id) ? current.itemIds.filter((id) => id !== item.id) : [...current.itemIds, item.id] }))} /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="text-xs text-zinc-400">{item.pricePerDay} ₽</span></label>)}</div>
                  <button type="button" disabled={saving || !offer.userId || !offer.title.trim() || !offer.startsAt || !offer.endsAt || offer.itemIds.length === 0} onClick={() => void post({ action: "CREATE_OFFER", ...offer, startsAt: new Date(offer.startsAt).toISOString(), endsAt: new Date(offer.endsAt).toISOString() })} className="mt-1 h-12 rounded-xl bg-[#6426cf] px-4 text-sm font-black text-white transition-colors hover:bg-[#5320aa] disabled:opacity-40">Создать для {offer.itemIds.length || 0} позиций</button>
                </div>
              </section>
              <section className="space-y-3">
                {data.offers.length === 0 ? <div className="rounded-3xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">Персональных предложений пока нет.</div> : data.offers.map((entry) => <article key={entry.id} className="rounded-3xl border border-zinc-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="text-lg font-black">{entry.title}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${entry.isActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"}`}>{entry.isActive ? "Активно" : "Выключено"}</span></div><p className="mt-1 text-sm text-zinc-600">{entry.user.displayName} · {formatDate(entry.startsAt)} — {formatDate(entry.endsAt)}</p></div><div className="text-3xl font-black text-violet-700">−{entry.discountPercent}%</div></div>{entry.description && <p className="mt-4 text-sm leading-6 text-zinc-600">{entry.description}</p>}<div className="mt-4 flex flex-wrap gap-2">{entry.items.slice(0, 8).map((item) => <span key={item.id} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold">{item.name}</span>)}{entry.items.length > 8 && <span className="px-2 py-1 text-xs text-zinc-500">ещё {entry.items.length - 8}</span>}</div><button type="button" onClick={() => void post({ action: "SET_OFFER_ACTIVE", offerId: entry.id, isActive: !entry.isActive })} className="mt-5 text-sm font-bold text-violet-700 hover:text-violet-900">{entry.isActive ? "Приостановить" : "Включить снова"}</button></article>)}
              </section>
            </div>
          )}

          {data && policy && tab === "rules" && (
            <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5 md:p-7">
              <div className="max-w-3xl"><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Будущие события</p><h2 className="mt-1 text-2xl font-black">Правила рейтинга</h2><p className="mt-2 text-sm leading-6 text-zinc-600">Сохранение не переписывает историю. Отрицательные организационные события остаются восстанавливаемыми.</p></div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{numberFields.map((field) => <label key={field.key} className="rounded-2xl bg-zinc-50 p-3 text-xs font-bold text-zinc-700">{field.label}<input type="number" value={policy[field.key]} onChange={(event) => setPolicy({ ...policy, [field.key]: Number(event.target.value) })} className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base font-black" /><span className="mt-1 block font-normal text-zinc-500">{field.hint}</span></label>)}</div>
              <div className="mt-8"><h3 className="font-black">Уровни и единая скидка</h3><div className="mt-3 space-y-2">{policy.tiers.map((tier, index) => <div key={tier.id ?? index} className="grid gap-2 rounded-2xl border border-zinc-200 p-3 sm:grid-cols-[1fr_120px_140px]"><input value={tier.name} onChange={(event) => setPolicy({ ...policy, tiers: policy.tiers.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row) })} className="h-10 rounded-lg border border-zinc-300 px-3 text-sm font-bold" /><label className="flex items-center gap-2 text-xs text-zinc-500">от <input type="number" min={0} max={100} value={tier.minScore} onChange={(event) => setPolicy({ ...policy, tiers: policy.tiers.map((row, rowIndex) => rowIndex === index ? { ...row, minScore: Number(event.target.value) } : row) })} className="h-10 w-full rounded-lg border border-zinc-300 px-2 text-sm font-bold" /></label><label className="flex items-center gap-2 text-xs text-zinc-500">скидка <input type="number" min={0} max={100} value={tier.discountPercent} onChange={(event) => setPolicy({ ...policy, tiers: policy.tiers.map((row, rowIndex) => rowIndex === index ? { ...row, discountPercent: Number(event.target.value) } : row) })} className="h-10 w-full rounded-lg border border-zinc-300 px-2 text-sm font-bold" />%</label></div>)}</div></div>
              <button type="button" disabled={saving} onClick={() => { const { tiers, ...values } = policy; void post({ action: "UPDATE_POLICY", policy: values, tiers: tiers.map((tier, index) => ({ name: tier.name, minScore: tier.minScore, discountPercent: tier.discountPercent, sortOrder: index })) }); }} className="mt-7 h-12 rounded-xl bg-zinc-950 px-6 text-sm font-black text-white transition-colors hover:bg-zinc-800 disabled:opacity-50">Сохранить правила</button>
            </section>
          )}

          {data && tab === "history" && (
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <section className="rounded-3xl border border-zinc-200 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Доставка</p><h2 className="mt-1 text-xl font-black">Предупреждения</h2></div><div className="flex gap-2 text-xs font-bold"><span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">Отправлено {data.reminders.counts.SENT ?? 0}</span><span className="rounded-full bg-red-100 px-2 py-1 text-red-800">Ошибки {data.reminders.counts.FAILED ?? 0}</span></div></div><div className="mt-4 divide-y divide-zinc-100">{data.reminders.recent.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">Этапных предупреждений пока не было.</p> : data.reminders.recent.map((reminder) => <div key={reminder.id} className="py-3"><div className="flex justify-between gap-3"><div className="text-sm font-bold">{reminder.order.eventName || reminder.order.customer.name}</div><span className={`text-xs font-black ${reminder.status === "FAILED" ? "text-red-700" : "text-zinc-500"}`}>{reminder.status}</span></div><p className="mt-1 text-xs text-zinc-500">{reminder.recipient?.displayName ?? "Склад"} · {formatDate(reminder.updatedAt)}</p>{reminder.lastError && <p className="mt-1 text-xs text-red-700">{reminder.lastError}</p>}</div>)}</div></section>
              <section className="rounded-3xl border border-zinc-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Аудит</p><h2 className="mt-1 text-xl font-black">Последние изменения рейтинга</h2><div className="mt-4 divide-y divide-zinc-100">{data.events.map((event) => <div key={event.id} className="grid grid-cols-[auto_1fr] gap-3 py-3"><span className={`mt-0.5 min-w-10 rounded-full px-2 py-1 text-center text-xs font-black ${event.delta >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{event.delta > 0 ? "+" : ""}{event.delta}</span><div><div className="text-sm font-bold">{event.user.displayName}</div><p className="mt-0.5 text-xs leading-5 text-zinc-600">{event.reason}</p><p className="mt-1 text-[11px] text-zinc-400">{formatDate(event.createdAt)} · {event.type}</p></div></div>)}</div></section>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
