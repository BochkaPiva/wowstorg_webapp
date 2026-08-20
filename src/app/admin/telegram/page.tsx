"use client";

import Link from "next/link";
import * as React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type ScenarioGroup = "connection" | "orders" | "confirmations" | "operations";
type ScenarioAudience = "warehouse" | "greenwich";
type TargetKind = "warehouse" | "greenwich-user" | "dm";
type Scenario = { id: string; group: ScenarioGroup; audience: ScenarioAudience; title: string; description: string; hasActions?: boolean; preview: string };
type GreenwichUser = { id: string; displayName: string; login: string; telegramChatId: string | null; hasTelegramChatId: boolean };
type LiveCheckpoint = { id: "DAYS_30" | "DAYS_7" | "DAYS_3"; daysBefore: number; label: string };
type LiveOrder = {
  id: string;
  eventName: string | null;
  customerName: string;
  status: string;
  startDate: string;
  endDate: string;
  readyByDate: string;
  greenwichUserId: string | null;
  greenwichUser: { id: string; displayName: string; hasTelegramChatId: boolean } | null;
};
type LiveReminder = {
  id: string;
  checkpoint: LiveCheckpoint["id"];
  scheduledFor: string;
  sentAt: string | null;
  lastSentAt: string | null;
  sendCount: number;
  response: "CONFIRMED" | "CHANGES_PENDING" | "CANCELLED" | null;
  respondedAt: string | null;
  telegramChatId: string;
  order: {
    id: string;
    eventName: string | null;
    customerName: string;
    status: string;
    greenwichUser: { id: string; displayName: string } | null;
  };
};
type RatingPolicy = {
  confirmationResponseReward: number;
  repeatMissedPenalty: number;
  finalMissedPenalty: number;
  overduePenaltyPerDay: number;
  overduePenaltyCap: number;
  perfectReturnReward: number;
  repairPenaltyPerUnit: number;
  lostPenaltyPerUnit: number;
  incidentPenaltyCap: number;
  recoveryGraceDays: number;
  recoveryDurationDays: number;
  tiers: Array<{ id: string; name: string; minScore: number; discountPercent: number; sortOrder: number }>;
  updatedAt: string;
};
type TelegramStatus = {
  telegram: { hasBotToken: boolean; warehouseChatId: string | null; warehouseTopicId: string | null; webhookUrl: string | null; webhookSecretConfigured: boolean; sendTimeoutMs?: number; proxyEnabled?: boolean; proxyLabel?: string | null };
  greenwich: { activeUsers: number; withTelegramChatId: number; users: GreenwichUser[] };
  liveConfirmation: { checkpoints: LiveCheckpoint[]; orders: LiveOrder[]; recent: LiveReminder[] };
  ratingPolicy: RatingPolicy;
  scenarios: Scenario[];
};
type HistoryItem = { id: string; title: string; target: string; time: string; ok: boolean; detail: string };

const GROUPS: Array<{ id: ScenarioGroup | "all"; label: string }> = [
  { id: "all", label: "Все" }, { id: "connection", label: "Связь" }, { id: "orders", label: "Заявки" },
  { id: "confirmations", label: "Подтверждения" }, { id: "operations", label: "Проекты и задачи" },
];

function Icon({ name, className = "h-5 w-5" }: { name: "send" | "refresh" | "shield" | "check" | "warning" | "chevron" | "bot" | "history" | "users"; className?: string }) {
  const paths = {
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>, refresh: <><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>, check: <path d="m5 12 4 4L19 6"/>,
    warning: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>, chevron: <path d="m9 18 6-6-6-6"/>,
    bot: <><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M12 4v4M8 12h.01M16 12h.01M9 16h6"/></>, history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
  };
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function cleanPreview(value: string) { return value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&").replaceAll("&quot;", '"'); }
function audienceLabel(audience: ScenarioAudience) { return audience === "warehouse" ? "Склад" : "Greenwich"; }
function formatDate(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString("ru-RU") : "—"; }
function checkpointLabel(value: LiveCheckpoint["id"]) { return value === "DAYS_30" ? "За 30 дней" : value === "DAYS_7" ? "За 7 дней" : "За 3 дня"; }
function responseLabel(value: LiveReminder["response"]) { if (value === "CONFIRMED") return "Всё актуально"; if (value === "CHANGES_PENDING") return "Будут изменения"; if (value === "CANCELLED") return "Заявка отменена"; return "Ожидает ответа"; }
function responseClass(value: LiveReminder["response"]) { if (value === "CONFIRMED") return "bg-emerald-100 text-emerald-800"; if (value === "CHANGES_PENDING") return "bg-amber-100 text-amber-900"; if (value === "CANCELLED") return "bg-rose-100 text-rose-800"; return "bg-zinc-100 text-zinc-700"; }

function StatusCell({ label, value, ok, detail }: { label: string; value: string; ok: boolean; detail?: string }) {
  return <div className="min-w-0 border-r border-zinc-200 px-4 py-4 last:border-r-0 md:px-5"><div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} /><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</span></div><p className="mt-2 truncate text-sm font-semibold text-zinc-950">{value}</p>{detail ? <p className="mt-0.5 truncate text-xs text-zinc-500">{detail}</p> : null}</div>;
}

function PolicyField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return <label className="block border border-zinc-300 bg-white p-4">
    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
    <span className="mt-3 flex items-end gap-3">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-12 w-24 border-b-2 border-zinc-950 bg-transparent px-1 text-2xl font-black tabular-nums text-zinc-950 outline-none focus:border-[#6426cf]"
      />
      <span className="pb-3 text-xs leading-5 text-zinc-500">{hint}</span>
    </span>
  </label>;
}

export default function AdminTelegramPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [status, setStatus] = React.useState<TelegramStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [group, setGroup] = React.useState<ScenarioGroup | "all">("all");
  const [scenarioId, setScenarioId] = React.useState("");
  const [target, setTarget] = React.useState<TargetKind>("warehouse");
  const [greenwichUserId, setGreenwichUserId] = React.useState("");
  const [dmChatId, setDmChatId] = React.useState("");
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [liveUserId, setLiveUserId] = React.useState("");
  const [liveOrderId, setLiveOrderId] = React.useState("");
  const [liveCheckpoint, setLiveCheckpoint] = React.useState<LiveCheckpoint["id"]>("DAYS_7");
  const [liveBusy, setLiveBusy] = React.useState(false);
  const [liveError, setLiveError] = React.useState<string | null>(null);
  const [policyDraft, setPolicyDraft] = React.useState<RatingPolicy | null>(null);
  const [policyBusy, setPolicyBusy] = React.useState(false);
  const [policyMessage, setPolicyMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/telegram", { cache: "no-store" });
      const data = (await response.json()) as TelegramStatus & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || `Ошибка ${response.status}`);
      setStatus(data); setScenarioId((current) => current || data.scenarios[0]?.id || "");
      setPolicyDraft(data.ratingPolicy);
      setGreenwichUserId((current) => current || data.greenwich.users.find((user) => user.hasTelegramChatId)?.id || "");
      setLiveUserId((currentUserId) => {
        const currentIsEligible = data.liveConfirmation.orders.some(
          (order) => order.greenwichUserId === currentUserId && order.greenwichUser?.hasTelegramChatId,
        );
        const nextUserId = currentIsEligible
          ? currentUserId
          : data.liveConfirmation.orders.find((order) => order.greenwichUser?.hasTelegramChatId)?.greenwichUserId ?? "";
        setLiveOrderId((currentOrderId) => {
          const currentOrderIsEligible = data.liveConfirmation.orders.some(
            (order) => order.id === currentOrderId && order.greenwichUserId === nextUserId,
          );
          return currentOrderIsEligible
            ? currentOrderId
            : data.liveConfirmation.orders.find((order) => order.greenwichUserId === nextUserId)?.id ?? "";
        });
        return nextUserId;
      });
    } catch (cause) { setStatus(null); setError(cause instanceof Error ? cause.message : "Не удалось получить настройки Telegram"); }
    finally { if (!silent) setLoading(false); }
  }, []);

  React.useEffect(() => { if (!forbidden) void load(); }, [forbidden, load]);
  const selectedScenario = status?.scenarios.find((item) => item.id === scenarioId) ?? null;
  const filteredScenarios = status?.scenarios.filter((item) => group === "all" || item.group === group) ?? [];
  const selectedUser = status?.greenwich.users.find((user) => user.id === greenwichUserId) ?? null;
  const liveOrdersForUser = status?.liveConfirmation.orders.filter((order) => order.greenwichUserId === liveUserId) ?? [];
  const selectedLiveOrder = liveOrdersForUser.find((order) => order.id === liveOrderId) ?? null;
  const selectedLiveReminder = status?.liveConfirmation.recent.find(
    (item) => item.order.id === liveOrderId && item.checkpoint === liveCheckpoint,
  ) ?? null;

  React.useEffect(() => {
    if (!selectedLiveReminder?.sentAt || selectedLiveReminder.response) return;
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load, selectedLiveReminder?.response, selectedLiveReminder?.sentAt]);

  function selectScenario(item: Scenario) { setScenarioId(item.id); setTarget(item.audience === "greenwich" ? "greenwich-user" : "warehouse"); }
  function targetName(kind: TargetKind | "greenwich-broadcast") { if (kind === "warehouse") return "Чат склада"; if (kind === "greenwich-broadcast") return "Все подключённые Greenwich"; if (kind === "dm") return dmChatId.trim() || "Личный chat_id"; return selectedUser?.displayName || "Сотрудник Greenwich"; }
  function selectLiveUser(userId: string) {
    setLiveUserId(userId);
    setLiveOrderId(status?.liveConfirmation.orders.find((order) => order.greenwichUserId === userId)?.id ?? "");
    setLiveError(null);
  }

  async function saveRatingPolicy() {
    if (!policyDraft || policyBusy) return;
    setPolicyBusy(true);
    setPolicyMessage(null);
    try {
      const response = await fetch("/api/admin/telegram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationResponseReward: policyDraft.confirmationResponseReward,
          repeatMissedPenalty: policyDraft.repeatMissedPenalty,
          finalMissedPenalty: policyDraft.finalMissedPenalty,
          overduePenaltyPerDay: policyDraft.overduePenaltyPerDay,
          overduePenaltyCap: policyDraft.overduePenaltyCap,
          perfectReturnReward: policyDraft.perfectReturnReward,
          repairPenaltyPerUnit: policyDraft.repairPenaltyPerUnit,
          lostPenaltyPerUnit: policyDraft.lostPenaltyPerUnit,
          incidentPenaltyCap: policyDraft.incidentPenaltyCap,
          recoveryGraceDays: policyDraft.recoveryGraceDays,
          recoveryDurationDays: policyDraft.recoveryDurationDays,
          tiers: policyDraft.tiers.map(({ name, minScore, discountPercent, sortOrder }) => ({
            name, minScore, discountPercent, sortOrder,
          })),
        }),
      });
      const data = (await response.json()) as { ratingPolicy?: RatingPolicy; error?: { message?: string } };
      if (!response.ok || !data.ratingPolicy) {
        throw new Error(data.error?.message || `Ошибка ${response.status}`);
      }
      setPolicyDraft(data.ratingPolicy);
      setStatus((current) => current ? { ...current, ratingPolicy: data.ratingPolicy as RatingPolicy } : current);
      setPolicyMessage("Правила сохранены. Новые скидки и события рейтинга применяются автоматически.");
    } catch (cause) {
      setPolicyMessage(cause instanceof Error ? cause.message : "Не удалось сохранить правила рейтинга");
    } finally {
      setPolicyBusy(false);
    }
  }

  async function sendLiveConfirmation() {
    if (!selectedLiveOrder || !liveUserId || liveBusy) return;
    const recipient = selectedLiveOrder.greenwichUser?.displayName ?? "сотрудник Greenwich";
    const confirmed = window.confirm(
      [
        `Отправить реальное подтверждение сотруднику «${recipient}»?`,
        "",
        `Заявка: ${selectedLiveOrder.eventName || selectedLiveOrder.customerName}`,
        `Контрольная точка: ${checkpointLabel(liveCheckpoint)}.`,
        "",
        "Это боевой сценарий: ответ запишется в заявку, склад получит уведомление, а подтверждённая отмена действительно отменит заявку и активные дополнения.",
      ].join("\n"),
    );
    if (!confirmed) return;
    setLiveBusy(true);
    setLiveError(null);
    try {
      const response = await fetch("/api/admin/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "greenwich-live-confirmation",
          userId: liveUserId,
          orderId: selectedLiveOrder.id,
          checkpoint: liveCheckpoint,
        }),
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || `Ошибка ${response.status}`);
      await load(true);
    } catch (cause) {
      setLiveError(cause instanceof Error ? cause.message : "Не удалось отправить боевое подтверждение");
    } finally {
      setLiveBusy(false);
    }
  }

  async function send(kind: TargetKind | "greenwich-broadcast" = target) {
    if (!selectedScenario || busy) return;
    if (kind === "greenwich-broadcast" && !window.confirm(`Отправить сценарий «${selectedScenario.title}» всем подключённым сотрудникам Greenwich?`)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, scenarioId: selectedScenario.id, ...(kind === "greenwich-user" ? { userId: greenwichUserId } : {}), ...(kind === "dm" ? { chatId: dmChatId.trim() } : {}) }) });
      const data = (await response.json()) as { sent?: number; total?: number; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || `Ошибка ${response.status}`);
      const detail = kind === "greenwich-broadcast" ? `Доставлено ${data.sent ?? 0} из ${data.total ?? 0}` : "Telegram принял сообщение";
      setHistory((current) => [{ id: crypto.randomUUID(), title: selectedScenario.title, target: targetName(kind), time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), ok: true, detail }, ...current].slice(0, 8));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Ошибка отправки"; setError(message);
      setHistory((current) => [{ id: crypto.randomUUID(), title: selectedScenario.title, target: targetName(kind), time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), ok: false, detail: message }, ...current].slice(0, 8));
    } finally { setBusy(false); }
  }

  const canSend = Boolean(selectedScenario && status?.telegram.hasBotToken && (target === "warehouse" ? status.telegram.warehouseChatId : target === "greenwich-user" ? selectedUser?.hasTelegramChatId : dmChatId.trim()));

  return <AppShell title="Telegram"><div className="mx-auto w-full max-w-[1480px] pb-16">
    <Link href="/admin" className="group mb-5 inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 transition-colors hover:text-zinc-950"><span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">←</span> Администрирование</Link>
    {forbidden ? <div className="border border-zinc-300 bg-white p-6 text-sm text-zinc-700">Раздел доступен только сотрудникам Wowstorg.</div> : <>
      <section className="overflow-hidden border border-zinc-300 border-t-4 border-t-[#ffd21f] bg-white">
        <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1fr_auto] lg:items-end lg:px-9"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6426cf]">Администрирование · Telegram</p><h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.045em] text-zinc-950 md:text-6xl">Центр проверки бота</h1><p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600">Проверяйте реальные шаблоны, маршруты доставки и inline-кнопки до того, как уведомление понадобится в работе.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-12 items-center justify-center gap-2 border border-zinc-300 bg-white px-5 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-100 disabled:opacity-50"><Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Обновить статус</button></div>
        {loading ? <div className="grid grid-cols-2 border-t border-zinc-200 md:grid-cols-4">{[0,1,2,3].map((item) => <div key={item} className="h-24 animate-pulse border-r border-zinc-200 bg-zinc-50 last:border-r-0" />)}</div> : status ? <div className="grid grid-cols-2 border-t border-zinc-200 md:grid-cols-4"><StatusCell label="Bot API" value={status.telegram.hasBotToken ? "Токен подключён" : "Токен не задан"} ok={status.telegram.hasBotToken} detail={`${status.telegram.sendTimeoutMs ?? 0} мс`} /><StatusCell label="Склад" value={status.telegram.warehouseChatId ? "Маршрут готов" : "Чат не задан"} ok={Boolean(status.telegram.warehouseChatId)} detail={status.telegram.warehouseTopicId ? `Топик ${status.telegram.warehouseTopicId}` : "Без топика"} /><StatusCell label="Webhook" value={status.telegram.webhookSecretConfigured ? "Защищён" : "Нужна настройка"} ok={status.telegram.webhookSecretConfigured} detail={status.telegram.webhookUrl ?? "URL не задан"} /><StatusCell label="Greenwich" value={`${status.greenwich.withTelegramChatId} из ${status.greenwich.activeUsers} подключено`} ok={status.greenwich.activeUsers === status.greenwich.withTelegramChatId && status.greenwich.activeUsers > 0} detail="Личные получатели" /></div> : null}
      </section>

      {!loading && status ? <section className="mt-5 overflow-hidden border border-zinc-300 border-t-4 border-t-rose-500 bg-white">
        <div className="grid gap-6 border-b border-zinc-200 bg-[#0b0b0b] px-6 py-7 text-white lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-300">Боевой end-to-end тест</p>
              <span className="border border-rose-400/50 bg-rose-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-200">Меняет реальные данные</span>
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] md:text-4xl">Проверка настоящего сценария</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">Выберите сотрудника и его активную заявку. Сообщение уйдёт с настоящими кнопками, ответ пройдёт через production webhook, запишется в журнал заявки и вызовет реальные уведомления склада.</p>
          </div>
          <div className="grid grid-cols-3 gap-px border border-zinc-700 bg-zinc-700 text-center text-xs">
            <div className="bg-zinc-950 px-4 py-3"><span className="block font-black text-emerald-300">Актуально</span><span className="mt-1 block text-zinc-500">уведомит склад</span></div>
            <div className="bg-zinc-950 px-4 py-3"><span className="block font-black text-amber-300">Изменения</span><span className="mt-1 block text-zinc-500">создаст сигнал</span></div>
            <div className="bg-zinc-950 px-4 py-3"><span className="block font-black text-rose-300">Отмена</span><span className="mt-1 block text-zinc-500">отменит заявку</span></div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-200 lg:grid-cols-[0.8fr_1.35fr_0.85fr]">
          <label className="bg-white p-5 lg:p-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">01 · Получатель</span>
            <span className="relative mt-3 block">
              <select value={liveUserId} onChange={(event) => selectLiveUser(event.target.value)} className="h-14 w-full appearance-none border border-zinc-300 bg-white px-4 pr-11 text-sm font-bold text-zinc-950 outline-none focus:border-[#6426cf] focus:ring-2 focus:ring-violet-100">
                <option value="">Выберите сотрудника</option>
                {status.greenwich.users.map((user) => {
                  const hasOrders = status.liveConfirmation.orders.some((order) => order.greenwichUserId === user.id);
                  return <option key={user.id} value={user.id} disabled={!user.hasTelegramChatId || !hasOrders}>{user.displayName}{!user.hasTelegramChatId ? " · нет Chat ID" : !hasOrders ? " · нет активных заявок" : ""}</option>;
                })}
              </select>
              <Icon name="chevron" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-zinc-500" />
            </span>
          </label>

          <label className="bg-white p-5 lg:p-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">02 · Реальная заявка</span>
            <span className="relative mt-3 block">
              <select value={liveOrderId} onChange={(event) => { setLiveOrderId(event.target.value); setLiveError(null); }} disabled={!liveUserId} className="h-14 w-full appearance-none border border-zinc-300 bg-white px-4 pr-11 text-sm font-bold text-zinc-950 outline-none focus:border-[#6426cf] focus:ring-2 focus:ring-violet-100 disabled:bg-zinc-100 disabled:text-zinc-400">
                <option value="">Выберите заявку</option>
                {liveOrdersForUser.map((order) => <option key={order.id} value={order.id}>{order.eventName || order.customerName} · {formatDate(order.startDate)}</option>)}
              </select>
              <Icon name="chevron" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-zinc-500" />
            </span>
          </label>

          <div className="bg-white p-5 lg:p-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">03 · Контрольная точка</span>
            <div className="mt-3 grid h-14 grid-cols-3 border border-zinc-300 bg-zinc-100 p-1">
              {status.liveConfirmation.checkpoints.map((checkpoint) => <button type="button" key={checkpoint.id} onClick={() => { setLiveCheckpoint(checkpoint.id); setLiveError(null); }} className={`px-2 text-xs font-black transition-colors ${liveCheckpoint === checkpoint.id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-white hover:text-zinc-950"}`}>{checkpoint.daysBefore} дн.</button>)}
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-8">
          {selectedLiveOrder ? <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#6426cf]">{selectedLiveOrder.customerName}</p>
              <p className="mt-1 text-xl font-black tracking-[-0.02em] text-zinc-950">{selectedLiveOrder.eventName || "Заявка без названия"}</p>
              <p className="mt-2 text-sm text-zinc-500">{formatDate(selectedLiveOrder.startDate)} — {formatDate(selectedLiveOrder.endDate)} · статус {selectedLiveOrder.status}</p>
            </div>
            {selectedLiveReminder ? <div className="border-l-2 border-zinc-200 pl-4">
              <span className={`inline-flex px-2.5 py-1 text-xs font-black ${responseClass(selectedLiveReminder.response)}`}>{responseLabel(selectedLiveReminder.response)}</span>
              <p className="mt-2 text-xs text-zinc-500">{checkpointLabel(selectedLiveReminder.checkpoint)} · отправлено {formatDate(selectedLiveReminder.sentAt)}</p>
            </div> : null}
          </div> : <p className="text-sm text-zinc-500">Выберите сотрудника и активную заявку, чтобы разблокировать боевую отправку.</p>}
          <button type="button" onClick={() => void sendLiveConfirmation()} disabled={!selectedLiveOrder || liveBusy || !status.telegram.hasBotToken || !status.telegram.webhookSecretConfigured} className="inline-flex h-14 items-center justify-center gap-2 bg-rose-600 px-6 text-sm font-black text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"><Icon name="send" className="h-4 w-4" />{liveBusy ? "Отправляем…" : "Запустить реальный тест"}</button>
        </div>
        {liveError ? <div role="alert" className="mx-6 mb-6 flex gap-3 border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 lg:mx-8"><Icon name="warning" className="h-5 w-5 shrink-0" />{liveError}</div> : null}

        <div className="border-t border-zinc-200">
          <div className="flex flex-wrap items-end justify-between gap-3 px-6 py-5 lg:px-8">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">Журнал production-ответов</p><p className="mt-1 text-sm text-zinc-600">Обновляется автоматически, пока выбранное сообщение ждёт нажатия.</p></div>
            <button type="button" onClick={() => void load(true)} className="inline-flex items-center gap-2 text-sm font-bold text-zinc-600 hover:text-zinc-950"><Icon name="refresh" className="h-4 w-4" /> Обновить журнал</button>
          </div>
          {status.liveConfirmation.recent.length ? <div className="divide-y divide-zinc-200 border-t border-zinc-200">
            {status.liveConfirmation.recent.slice(0, 8).map((entry) => <div key={entry.id} className="grid gap-3 px-6 py-4 md:grid-cols-[minmax(0,1fr)_150px_180px] md:items-center lg:px-8">
              <div className="min-w-0"><p className="truncate text-sm font-bold text-zinc-950">{entry.order.eventName || entry.order.customerName}</p><p className="mt-1 truncate text-xs text-zinc-500">{entry.order.greenwichUser?.displayName ?? "Greenwich"} · {checkpointLabel(entry.checkpoint)} · касание {entry.sendCount}/3 · последнее {formatDate(entry.lastSentAt || entry.sentAt)}</p></div>
              <span className={`w-fit px-2.5 py-1 text-xs font-black ${responseClass(entry.response)}`}>{responseLabel(entry.response)}</span>
              <p className="text-xs text-zinc-500 md:text-right">{entry.respondedAt ? `Ответ ${formatDate(entry.respondedAt)}` : "Telegram ждёт действие"}<br />Текущий статус: {entry.order.status}</p>
            </div>)}
          </div> : <div className="border-t border-zinc-200 px-6 py-8 text-sm text-zinc-500 lg:px-8">Боевых проверок пока не было.</div>}
        </div>
      </section> : null}

      {!loading && policyDraft ? <section className="mt-5 overflow-hidden border border-zinc-300 border-t-4 border-t-[#6426cf] bg-white">
        <div className="grid gap-5 border-b border-zinc-200 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6426cf]">Рейтинг Greenwich · мотивация и лояльность</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-zinc-950 md:text-3xl">Понятные действия → рейтинг → персональная скидка</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">Сотрудник видит причину каждого изменения, путь восстановления и следующий уровень. Один инцидент ограничен лимитом и не может обрушить рейтинг целиком.</p>
          </div>
          <div className="border-l-2 border-[#ffd21f] pl-4 text-xs leading-5 text-zinc-600">
            <strong className="block text-zinc-950">Цепочка ограничена тремя сообщениями</strong>
            Основное → через 3 часа повтор → ещё через 1 час финальное.
          </div>
        </div>
        <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 lg:px-8">Ответы и подтверждения</div>
        <div className="grid gap-px bg-zinc-200 md:grid-cols-2 xl:grid-cols-3">
          <PolicyField label="Ответ вовремя" hint="баллов" value={policyDraft.confirmationResponseReward} min={0} max={10} onChange={(value) => setPolicyDraft((current) => current ? { ...current, confirmationResponseReward: value } : current)} />
          <PolicyField label="После 3 часов" hint="баллов" value={policyDraft.repeatMissedPenalty} min={-20} max={0} onChange={(value) => setPolicyDraft((current) => current ? { ...current, repeatMissedPenalty: value } : current)} />
          <PolicyField label="После финального" hint="баллов" value={policyDraft.finalMissedPenalty} min={-20} max={0} onChange={(value) => setPolicyDraft((current) => current ? { ...current, finalMissedPenalty: value } : current)} />
        </div>
        <div className="border-y border-zinc-200 bg-zinc-50 px-6 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 lg:px-8">Возврат и сохранность</div>
        <div className="grid gap-px bg-zinc-200 md:grid-cols-2 xl:grid-cols-4">
          <PolicyField label="Просрочка за день" hint="баллов" value={policyDraft.overduePenaltyPerDay} min={-20} max={0} onChange={(value) => setPolicyDraft((current) => current ? { ...current, overduePenaltyPerDay: value } : current)} />
          <PolicyField label="Лимит просрочки" hint="баллов" value={policyDraft.overduePenaltyCap} min={-100} max={0} onChange={(value) => setPolicyDraft((current) => current ? { ...current, overduePenaltyCap: value } : current)} />
          <PolicyField label="Идеальный возврат" hint="баллов" value={policyDraft.perfectReturnReward} min={0} max={20} onChange={(value) => setPolicyDraft((current) => current ? { ...current, perfectReturnReward: value } : current)} />
          <PolicyField label="Ремонт за единицу" hint="баллов" value={policyDraft.repairPenaltyPerUnit} min={-20} max={0} onChange={(value) => setPolicyDraft((current) => current ? { ...current, repairPenaltyPerUnit: value } : current)} />
          <PolicyField label="Потеря за единицу" hint="баллов" value={policyDraft.lostPenaltyPerUnit} min={-20} max={0} onChange={(value) => setPolicyDraft((current) => current ? { ...current, lostPenaltyPerUnit: value } : current)} />
          <PolicyField label="Лимит инцидента" hint="баллов" value={policyDraft.incidentPenaltyCap} min={-100} max={0} onChange={(value) => setPolicyDraft((current) => current ? { ...current, incidentPenaltyCap: value } : current)} />
          <PolicyField label="Пауза до возврата" hint="дней" value={policyDraft.recoveryGraceDays} min={0} max={365} onChange={(value) => setPolicyDraft((current) => current ? { ...current, recoveryGraceDays: value } : current)} />
          <PolicyField label="Срок восстановления" hint="дней" value={policyDraft.recoveryDurationDays} min={1} max={730} onChange={(value) => setPolicyDraft((current) => current ? { ...current, recoveryDurationDays: value } : current)} />
        </div>
        <div className="border-t border-zinc-200 px-6 py-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6426cf]">Уровни и скидки</p><h3 className="mt-1 text-xl font-black text-zinc-950">Каталог сам применяет уровень сотрудника</h3></div><p className="text-xs text-zinc-500">Порог 0 обязателен · скидка 0–60%</p></div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {policyDraft.tiers.map((tier, index) => <div key={tier.id || index} className="border border-zinc-300 bg-zinc-50 p-4">
              <input aria-label="Название уровня" value={tier.name} onChange={(event) => setPolicyDraft((current) => current ? { ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } : current)} className="h-10 w-full border-b border-zinc-300 bg-transparent text-base font-black outline-none focus:border-[#6426cf]" />
              <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">От рейтинга<input type="number" min={0} max={100} value={tier.minScore} onChange={(event) => setPolicyDraft((current) => current ? { ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, minScore: Number(event.target.value) } : item) } : current)} className="mt-1 h-11 w-full border border-zinc-300 bg-white px-3 text-lg font-black outline-none focus:border-[#6426cf]" /></label><label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Скидка, %<input type="number" min={0} max={60} step={0.5} value={tier.discountPercent} onChange={(event) => setPolicyDraft((current) => current ? { ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, discountPercent: Number(event.target.value) } : item) } : current)} className="mt-1 h-11 w-full border border-zinc-300 bg-white px-3 text-lg font-black outline-none focus:border-[#6426cf]" /></label></div>
            </div>)}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-zinc-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p className={`text-sm ${policyMessage?.startsWith("Правила") ? "text-emerald-700" : "text-rose-700"}`}>{policyMessage ?? "Ручная корректировка сотрудника остаётся динамической: автоматический расчёт не отключается."}</p>
          <button type="button" onClick={() => void saveRatingPolicy()} disabled={policyBusy} className="h-12 bg-zinc-950 px-6 text-sm font-black text-white transition-colors hover:bg-[#6426cf] disabled:bg-zinc-300">{policyBusy ? "Сохраняем…" : "Сохранить правила"}</button>
        </div>
      </section> : null}

      <div className="mt-5 flex gap-3 border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-950"><Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Безопасные шаблонные тесты ниже.</strong> Они помечены как тестовые: кнопки проверяют webhook, но не меняют заявки, статусы, резерв или проекты.</div></div>
      {error ? <div role="alert" className="mt-4 flex items-start gap-3 border border-rose-300 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-900"><Icon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />{error}</div> : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(390px,0.82fr)]">
        <section className="border border-zinc-300 bg-white"><div className="border-b border-zinc-200 px-5 py-5 md:px-7"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">01 · Сценарий</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black tracking-[-0.025em] text-zinc-950">Что проверяем</h2><p className="mt-1 text-sm text-zinc-500">Шаблоны собраны по реальным событиям приложения.</p></div><span className="text-sm font-semibold tabular-nums text-zinc-500">{status?.scenarios.length ?? 0} сценария</span></div><div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Группы сценариев">{GROUPS.map((item) => <button type="button" key={item.id} onClick={() => setGroup(item.id)} className={`h-9 border px-3.5 text-sm font-semibold transition-colors ${group === item.id ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-500 hover:text-zinc-950"}`}>{item.label}</button>)}</div></div>
          <div className="divide-y divide-zinc-200">{filteredScenarios.map((item, index) => { const active = item.id === scenarioId; return <button type="button" key={item.id} onClick={() => selectScenario(item)} className={`group grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 text-left transition-colors md:px-7 ${active ? "bg-[#f5f0ff]" : "bg-white hover:bg-zinc-50"}`}><span className={`mt-0.5 flex h-7 w-7 items-center justify-center border text-[11px] font-black tabular-nums ${active ? "border-[#6426cf] bg-[#6426cf] text-white" : "border-zinc-300 text-zinc-500"}`}>{String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-bold text-zinc-950">{item.title}</span>{item.hasActions ? <span className="bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">3 кнопки</span> : null}</span><span className="mt-1 block text-sm leading-5 text-zinc-500">{item.description}</span></span><span className={`mt-0.5 border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${item.audience === "warehouse" ? "border-zinc-300 text-zinc-600" : "border-violet-200 bg-violet-50 text-violet-800"}`}>{audienceLabel(item.audience)}</span></button>; })}</div>
        </section>

        <aside className="self-start border border-zinc-300 bg-white xl:sticky xl:top-4"><div className="border-b border-zinc-200 px-5 py-5 md:px-6"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">02 · Получатель</p><h2 className="mt-2 text-2xl font-black tracking-[-0.025em] text-zinc-950">Контрольная отправка</h2><div className="mt-5 grid grid-cols-3 gap-1 border border-zinc-300 bg-zinc-100 p-1">{([['warehouse','Склад'],['greenwich-user','Greenwich'],['dm','Chat ID']] as const).map(([value,label]) => <button type="button" key={value} onClick={() => setTarget(value)} className={`min-h-10 px-2 text-xs font-bold transition-colors ${target === value ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-950"}`}>{label}</button>)}</div>
          {target === "warehouse" ? <div className="mt-3 border border-zinc-200 bg-zinc-50 px-4 py-3"><p className="text-sm font-bold text-zinc-950">Чат склада</p><p className="mt-1 truncate font-mono text-xs text-zinc-500">{status?.telegram.warehouseChatId ?? "Не настроен"}{status?.telegram.warehouseTopicId ? ` · топик ${status.telegram.warehouseTopicId}` : ""}</p></div> : null}
          {target === "greenwich-user" ? <label className="mt-3 block"><span className="sr-only">Сотрудник Greenwich</span><span className="relative block"><select value={greenwichUserId} onChange={(event) => setGreenwichUserId(event.target.value)} className="h-14 w-full appearance-none border border-zinc-300 bg-white px-4 pr-11 text-sm font-semibold text-zinc-950 outline-none transition-colors focus:border-[#6426cf] focus:ring-2 focus:ring-violet-100"><option value="">Выберите сотрудника</option>{status?.greenwich.users.map((user) => <option key={user.id} value={user.id} disabled={!user.hasTelegramChatId}>{user.displayName} · {user.hasTelegramChatId ? "подключён" : "нет Chat ID"}</option>)}</select><Icon name="chevron" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-zinc-500" /></span></label> : null}
          {target === "dm" ? <label className="mt-3 block"><span className="sr-only">Telegram Chat ID</span><input value={dmChatId} onChange={(event) => setDmChatId(event.target.value)} placeholder="Telegram Chat ID" className="h-14 w-full border border-zinc-300 bg-white px-4 font-mono text-sm text-zinc-950 outline-none transition-colors placeholder:font-sans placeholder:text-zinc-400 focus:border-[#6426cf] focus:ring-2 focus:ring-violet-100" /></label> : null}
        </div>
        <div className="border-b border-zinc-200 bg-[#0c0c0c] px-5 py-5 text-white md:px-6"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Предпросмотр Telegram</p><span className="text-xs text-zinc-500">HTML</span></div>{selectedScenario ? <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{cleanPreview(selectedScenario.preview)}</div> : <p className="mt-4 text-sm text-zinc-500">Выберите сценарий слева.</p>}{selectedScenario?.hasActions ? <div className="mt-5 grid gap-2"><div className="border border-zinc-700 px-3 py-2 text-center text-xs font-bold text-emerald-300">✓ Всё актуально</div><div className="grid grid-cols-2 gap-2"><div className="border border-zinc-700 px-2 py-2 text-center text-xs font-bold text-amber-300">Есть изменения</div><div className="border border-zinc-700 px-2 py-2 text-center text-xs font-bold text-rose-300">Отменить</div></div></div> : null}</div>
        <div className="p-5 md:p-6"><button type="button" onClick={() => void send()} disabled={!canSend || busy} className="flex h-14 w-full items-center justify-center gap-2 bg-[#ffd21f] px-5 text-sm font-black text-zinc-950 transition-colors hover:bg-[#f0c300] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"><Icon name="send" className="h-4 w-4" />{busy ? "Отправляем…" : `Отправить · ${selectedScenario?.title ?? "сценарий"}`}</button>{!canSend ? <p className="mt-2 text-center text-xs text-zinc-500">Выберите настроенного получателя.</p> : null}<button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="mt-4 flex w-full items-center justify-between border-t border-zinc-200 pt-4 text-left text-sm font-bold text-zinc-700"><span>Дополнительные проверки</span><Icon name="chevron" className={`h-4 w-4 transition-transform ${advancedOpen ? "-rotate-90" : "rotate-90"}`} /></button>{advancedOpen ? <div className="mt-4 border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><Icon name="users" className="h-5 w-5 shrink-0 text-amber-800"/><div><p className="text-sm font-bold text-amber-950">Массовая отправка Greenwich</p><p className="mt-1 text-xs leading-5 text-amber-800">Отправит выбранный сценарий всем {status?.greenwich.withTelegramChatId ?? 0} подключённым сотрудникам. Перед запуском попросим подтверждение.</p><button type="button" disabled={busy || !selectedScenario} onClick={() => void send("greenwich-broadcast")} className="mt-3 border border-amber-900 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50">Проверить массовую доставку</button></div></div></div> : null}</div>
        </aside>
      </div>

      <section className="mt-5 border border-zinc-300 bg-white"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 px-5 py-5 md:px-7"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">03 · Результаты</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-black tracking-[-0.025em] text-zinc-950"><Icon name="history" className="h-5 w-5"/> Последние проверки</h2></div>{history.length ? <button type="button" onClick={() => setHistory([])} className="text-sm font-semibold text-zinc-500 hover:text-zinc-950">Очистить историю</button> : null}</div>{history.length ? <div className="divide-y divide-zinc-200">{history.map((item) => <div key={item.id} className="grid gap-2 px-5 py-4 md:grid-cols-[28px_1fr_240px_70px] md:items-center md:px-7"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${item.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}><Icon name={item.ok ? "check" : "warning"} className="h-4 w-4"/></span><div><p className="text-sm font-bold text-zinc-950">{item.title}</p><p className="mt-0.5 text-xs text-zinc-500">{item.detail}</p></div><p className="text-sm text-zinc-600">{item.target}</p><time className="text-sm tabular-nums text-zinc-500">{item.time}</time></div>)}</div> : <div className="px-5 py-10 text-center md:px-7"><Icon name="bot" className="mx-auto h-8 w-8 text-zinc-300"/><p className="mt-3 text-sm font-semibold text-zinc-700">Отправок в этой сессии ещё не было</p><p className="mt-1 text-xs text-zinc-500">Результат появится здесь сразу после ответа Telegram API.</p></div>}</section>
      <details className="mt-5 border border-zinc-300 bg-white"><summary className="cursor-pointer px-5 py-4 text-sm font-bold text-zinc-800 md:px-7">Настройка webhook и диагностика</summary><div className="grid gap-5 border-t border-zinc-200 px-5 py-5 text-sm md:grid-cols-2 md:px-7"><div><p className="font-bold text-zinc-950">Webhook URL</p><code className="mt-2 block break-all border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">{status?.telegram.webhookUrl ?? "NEXT_PUBLIC_APP_URL не задан"}</code><p className="mt-3 text-xs leading-5 text-zinc-500">Для команд /start и inline-кнопок нужны TELEGRAM_WEBHOOK_SECRET и зарегистрированный webhook.</p></div><div><p className="font-bold text-zinc-950">Сеть</p><p className="mt-2 text-xs leading-5 text-zinc-600">Прокси: {status?.telegram.proxyEnabled ? status.telegram.proxyLabel ?? "включён" : "прямое подключение"}. Таймаут: {status?.telegram.sendTimeoutMs ?? "—"} мс.</p><p className="mt-3 text-xs text-zinc-500">Подробности: <code>docs/telegram-notifications.md</code></p></div></div></details>
    </>}
  </div></AppShell>;
}
