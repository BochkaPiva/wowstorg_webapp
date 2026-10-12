"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/app/_ui/AppShell";
import { SectionHeader } from "@/app/_ui/SectionHeader";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";
import { useReadResource } from "@/lib/use-json-resource";
import "@/app/inventory/inventory.css";

type Incident = {
  id: string; qty: number; remainingQty: number; repairedQty: number; utilizedQty: number;
  comment?: string | null; createdAt: string; resolvedAt?: string | null;
  order?: { id: string; customerName: string; eventName?: string | null; employeeName: string } | null;
  item?: { id: string; name: string } | null;
};
type Row = { key: string; id: string; itemId?: string; name: string; qty: number; manual: boolean; incident?: Incident };
type Action = { row: Row; kind: "restore" | "write-off"; qty: string };
type Discrepancy = { id: string; name: string; recorded: number; linked: number };
const date = (value: string) => new Date(value).toLocaleDateString("ru-RU");

function RepairPageInner() {
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const allowed = state.status === "authenticated" && state.user.role === "WOWSTORG";
  const urlCondition = searchParams.get("condition");
  const [condition, setCondition] = React.useState(() => urlCondition === "BROKEN" ? "BROKEN" : "NEEDS_REPAIR");
  const [conditionSource, setConditionSource] = React.useState(urlCondition);
  if (conditionSource !== urlCondition) {
    setConditionSource(urlCondition);
    if (urlCondition === "BROKEN" || urlCondition === "NEEDS_REPAIR") setCondition(urlCondition);
  }
  const [history, setHistory] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [source, setSource] = React.useState("all");
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState<Action | null>(null);
  const [actionError, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const scope = allowed ? JSON.stringify([condition, history]) : null;
  const [actionScope, setActionScope] = React.useState(scope);
  if (actionScope !== scope) { setActionScope(scope); setAction(null); setError(""); }
  const read = React.useCallback(async (signal?: AbortSignal) => {
    const responses = await Promise.all([
      fetch(`/api/warehouse/incidents?condition=${condition}&status=${history ? "CLOSED" : "OPEN"}`, { cache: "no-store", signal }),
      ...(!history ? [fetch(`/api/warehouse/repair-items?condition=${condition}`, { cache: "no-store", signal })] : []),
    ]);
    if (responses.some(r => !r.ok)) throw new Error("Не удалось загрузить ремонт. Повторите попытку.");
    const incidents = await responses[0]!.json() as { incidents: Incident[] };
    const items = responses[1] ? await responses[1].json() as { items?: { id: string; name: string; qty: number }[]; discrepancies?: Discrepancy[] } : null;
    return {
      discrepancies: items?.discrepancies ?? [],
      rows: [
        ...incidents.incidents.map(i => ({ key: "order-" + i.id, id: i.id, itemId: i.item?.id, name: i.item?.name ?? "Позиция", qty: i.remainingQty, manual: false, incident: i })),
        ...(items?.items ?? []).map(i => ({ key: "manual-" + i.id, id: i.id, itemId: i.id, name: i.name, qty: i.qty, manual: true })),
      ] as Row[],
    };
  }, [condition, history]);
  const resource = useReadResource(scope, read, "Ошибка загрузки");
  const rows = resource.data?.rows ?? [];
  const discrepancies = resource.data?.discrepancies ?? [];
  const loading = resource.loading;
  const error = actionError || resource.error || "";
  async function load() { setError(""); await resource.refresh(); }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action || busy) return;
    const qty = Number(action.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > action.row.qty) { setError("Укажите целое количество от 1 до " + action.row.qty); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const { row, kind } = action;
      const endpoint = row.manual ? `repair-items/${row.id}/${kind}` : `incidents/${row.id}/${kind === "restore" ? "repair" : "utilize"}`;
      const response = await fetch("/api/warehouse/" + endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qty, condition }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? "Не удалось выполнить операцию");
      setAction(null);
      setNotice(`${row.name}: ${kind === "restore" ? "восстановлено" : "списано"} ${qty} шт.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка операции"); }
    finally { setBusy(false); }
  }

  const query = search.trim().toLocaleLowerCase("ru");
  const visible = rows.filter(row => (source === "all" || (source === "manual") === row.manual) &&
    [row.name, row.incident?.order?.customerName, row.incident?.order?.eventName, row.incident?.order?.employeeName, row.incident?.comment].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(query));
  return <AppShell title="Ремонт и поломки">
    {!allowed ? <p>Раздел доступен сотрудникам склада.</p> : <div className="inventory-workspace">
      <SectionHeader title="Ремонт и поломки" mascot="inventory" description="Один случай — один источник. Восстановление возвращает доступность, списание уменьшает общий остаток." actions={<button type="button" onClick={() => void load()} disabled={loading || busy}>Обновить</button>} />
      <div className="inventory-toolbar">
        <div className="inventory-segments" aria-label="Состояние">
          <button aria-pressed={condition === "NEEDS_REPAIR"} disabled={busy} onClick={() => setCondition("NEEDS_REPAIR")}>Требует ремонта</button>
          <button aria-pressed={condition === "BROKEN"} disabled={busy} onClick={() => setCondition("BROKEN")}>Сломано</button>
        </div>
        <div className="inventory-segments" aria-label="Период">
          <button aria-pressed={!history} disabled={busy} onClick={() => setHistory(false)}>В работе</button>
          <button aria-pressed={history} disabled={busy} onClick={() => setHistory(true)}>История заявок</button>
        </div>
      </div>
      <div className="inventory-filters"><input aria-label="Поиск по ремонту" placeholder="Позиция, заказчик, мероприятие или сотрудник" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Источник" value={source} onChange={e => setSource(e.target.value)}><option value="all">Все источники</option><option value="order">Из заявок</option><option value="manual">Без заявки</option></select></div>
      {error && <div className="inventory-message inventory-error" role="alert">{error}</div>}
      {notice && <div className="inventory-message" role="status">{notice}</div>}
      {!loading && discrepancies.length > 0 && <div className="inventory-message inventory-error" role="alert"><strong>Нужна сверка остатков</strong><p>Открытых случаев больше, чем числится в ремонте. Операции по этим позициям заблокированы до сверки:</p><ul>{discrepancies.map(item => <li key={item.id}>{item.name}: в остатке {item.recorded}, по заявкам {item.linked}.</li>)}</ul></div>}
      {loading ? <ListSkeleton rows={4} /> : <>
        <div className="inventory-caption">{visible.length} записей{!history && ` · ${visible.reduce((n, r) => n + r.qty, 0)} шт. в работе`}</div>
        <div className="inventory-list">{visible.map(row => <article className="inventory-record" key={row.key}>
          <div className="inventory-record-main"><div><span className="inventory-badge">{row.manual ? "Без заявки" : "Из заявки"}</span><h2>{row.itemId ? <Link href={`/inventory/positions/${row.itemId}`}>{row.name}</Link> : row.name}</h2>
          {row.incident?.order ? <><Link className="inventory-source" href={`/orders/${row.incident.order.id}`}>{row.incident.order.eventName || row.incident.order.customerName} · {row.incident.order.customerName}</Link><p>Оформил: {row.incident.order.employeeName} · {date(row.incident.createdAt)}</p></> : <p>Количество отмечено в карточке позиции, без привязки к заявке.</p>}
          {row.incident?.comment && <p className="inventory-comment">{row.incident.comment}</p>}
          {row.incident && <p>Восстановлено: {row.incident.repairedQty} · Списано: {row.incident.utilizedQty}{row.incident.resolvedAt && ` · Закрыто ${date(row.incident.resolvedAt)}`}</p>}
          </div><div className="inventory-record-actions">{!history && <><strong className="inventory-quantity">{row.qty}<small>шт. в работе</small></strong><button className="inv-button" disabled={busy} onClick={() => { setError(""); setAction({ row, kind: "restore", qty: String(row.qty) }); }}>Восстановить</button><button className="inv-button inv-danger" disabled={busy} onClick={() => { setError(""); setAction({ row, kind: "write-off", qty: "1" }); }}>Списать</button></>}</div></div>
          {action?.row.key === row.key && <form className="inventory-confirm" onSubmit={submit}><div><strong>{action.kind === "restore" ? "Вернуть в доступный остаток" : "Списать безвозвратно"}</strong><p>{action.kind === "restore" ? "Общее количество не изменится." : "Общее количество уменьшится. Карточка позиции и история заявки сохранятся."}</p></div><label>Количество<input autoFocus type="number" min="1" max={row.qty} step="1" value={action.qty} disabled={busy} onChange={e => setAction({ ...action, qty: e.target.value })} /></label><button className="inv-button inv-primary" disabled={busy}>{busy ? "Сохраняем…" : "Подтвердить"}</button><button type="button" className="inv-button" disabled={busy} onClick={() => setAction(null)}>Отмена</button></form>}
        </article>)}</div>
        {!visible.length && <div className="inventory-empty">{search || source !== "all" ? "По выбранным фильтрам ничего не найдено." : history ? "Закрытых случаев из заявок пока нет." : "В этом разделе нет незавершённых случаев."}</div>}
      </>}
      <p className="inventory-caption">История показывает закрытые поломки из заявок. Старые ручные изменения без заявки не содержат сведений о заказчике.</p>
    </div>}
  </AppShell>;
}
export default function WarehouseRepairBasePage() { return <Suspense fallback={<AppShell title="Ремонт и поломки"><ListSkeleton rows={4} /></AppShell>}><RepairPageInner /></Suspense>; }
