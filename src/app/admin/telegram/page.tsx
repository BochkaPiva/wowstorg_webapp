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
type TelegramStatus = {
  telegram: { hasBotToken: boolean; warehouseChatId: string | null; warehouseTopicId: string | null; webhookUrl: string | null; webhookSecretConfigured: boolean; sendTimeoutMs?: number; proxyEnabled?: boolean; proxyLabel?: string | null };
  greenwich: { activeUsers: number; withTelegramChatId: number; users: GreenwichUser[] };
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

function StatusCell({ label, value, ok, detail }: { label: string; value: string; ok: boolean; detail?: string }) {
  return <div className="min-w-0 border-r border-zinc-200 px-4 py-4 last:border-r-0 md:px-5"><div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} /><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</span></div><p className="mt-2 truncate text-sm font-semibold text-zinc-950">{value}</p>{detail ? <p className="mt-0.5 truncate text-xs text-zinc-500">{detail}</p> : null}</div>;
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

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/admin/telegram", { cache: "no-store" });
      const data = (await response.json()) as TelegramStatus & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || `Ошибка ${response.status}`);
      setStatus(data); setScenarioId((current) => current || data.scenarios[0]?.id || "");
      setGreenwichUserId((current) => current || data.greenwich.users.find((user) => user.hasTelegramChatId)?.id || "");
    } catch (cause) { setStatus(null); setError(cause instanceof Error ? cause.message : "Не удалось получить настройки Telegram"); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { if (!forbidden) void load(); }, [forbidden, load]);
  const selectedScenario = status?.scenarios.find((item) => item.id === scenarioId) ?? null;
  const filteredScenarios = status?.scenarios.filter((item) => group === "all" || item.group === group) ?? [];
  const selectedUser = status?.greenwich.users.find((user) => user.id === greenwichUserId) ?? null;

  function selectScenario(item: Scenario) { setScenarioId(item.id); setTarget(item.audience === "greenwich" ? "greenwich-user" : "warehouse"); }
  function targetName(kind: TargetKind | "greenwich-broadcast") { if (kind === "warehouse") return "Чат склада"; if (kind === "greenwich-broadcast") return "Все подключённые Greenwich"; if (kind === "dm") return dmChatId.trim() || "Личный chat_id"; return selectedUser?.displayName || "Сотрудник Greenwich"; }

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
      <div className="mt-4 flex gap-3 border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-950"><Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Безопасный режим.</strong> Все сообщения помечены как тестовые. Кнопки подтверждения проверяют webhook, но не меняют заявки, статусы, резерв или проекты.</div></div>
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
