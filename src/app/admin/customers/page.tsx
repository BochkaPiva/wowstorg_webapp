"use client";

import Link from "next/link";
import React from "react";
import { createPortal } from "react-dom";

import { AppShell } from "@/app/_ui/AppShell";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";

type Counts = { orders: number; projects: number; standaloneEstimates: number; aliases?: number };
type Customer = {
  id: string; name: string; isActive?: boolean; notes?: string | null; logoUrl?: string | null;
  mergedInto?: { id: string; name: string } | null; counts?: Counts;
};
type DuplicateCandidate = Customer & { createdAt: string; _count: Counts };
type DuplicateGroup = { identityKey: string; suggestedTargetId: string; customers: DuplicateCandidate[] };
type MergeData = {
  summary: { groups: number; duplicateCards: number };
  groups: DuplicateGroup[];
  history: Array<{
    id: string; sourceName: string; targetName: string; movedOrders: number; movedProjects: number;
    movedStandaloneEstimates: number; createdAt: string; actor: { displayName: string };
  }>;
};

const emptyMergeData: MergeData = { summary: { groups: 0, duplicateCards: 0 }, groups: [], history: [] };
const usageTotal = (counts?: Counts) => (counts?.orders ?? 0) + (counts?.projects ?? 0) + (counts?.standaloneEstimates ?? 0);

function CustomerMark({ customer, large = false }: { customer: Customer; large?: boolean }) {
  return (
    <span className={`grid ${large ? "size-14 text-sm" : "size-11 text-xs"} shrink-0 place-items-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 font-black text-violet-900`}>
      {customer.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={customer.logoUrl} alt="" className="size-full object-contain" />
      ) : customer.name.slice(0, 2).toLocaleUpperCase("ru")}
    </span>
  );
}

export default function AdminCustomersPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [mergeData, setMergeData] = React.useState<MergeData>(emptyMergeData);
  const [targets, setTargets] = React.useState<Record<string, string>>({});
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createName, setCreateName] = React.useState("");
  const [createNotes, setCreateNotes] = React.useState("");
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editActive, setEditActive] = React.useState(true);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [customersResponse, mergeResponse] = await Promise.all([
        fetch("/api/customers?all=true", { cache: "no-store" }),
        fetch("/api/customers/merge", { cache: "no-store" }),
      ]);
      const customersPayload = (await customersResponse.json()) as { customers?: Customer[]; error?: { message?: string } };
      const mergePayload = (await mergeResponse.json()) as MergeData & { error?: { message?: string } };
      if (!customersResponse.ok) throw new Error(customersPayload.error?.message ?? "Не удалось загрузить заказчиков");
      if (!mergeResponse.ok) throw new Error(mergePayload.error?.message ?? "Не удалось проверить дубли");
      setCustomers(customersPayload.customers ?? []);
      setMergeData(mergePayload);
      setTargets(Object.fromEntries(mergePayload.groups.map((group) => [group.identityKey, group.suggestedTargetId])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { if (!forbidden) void load(); }, [forbidden, load]);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setError(null); setNotice(null); setSaving(true);
    try {
      const response = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: createName.trim(), notes: createNotes.trim() || undefined }) });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Не удалось создать заказчика");
      setCreateName(""); setCreateNotes(""); setNotice("Карточка заказчика создана"); await load();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Не удалось создать заказчика"); }
    finally { setSaving(false); }
  }

  async function mergeGroup(group: DuplicateGroup) {
    const targetId = targets[group.identityKey] ?? group.suggestedTargetId;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/customers/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId, sourceIds: group.customers.filter((customer) => customer.id !== targetId).map((customer) => customer.id) }) });
      const data = (await response.json()) as { result?: { targetName: string; mergedCustomers: number; movedOrders: number; movedProjects: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Не удалось объединить карточки");
      setConfirming(null);
      setNotice(`Объединено с «${data.result?.targetName}»: карточек ${data.result?.mergedCustomers ?? 0}, заявок ${data.result?.movedOrders ?? 0}, проектов ${data.result?.movedProjects ?? 0}`);
      await load();
    } catch (mergeError) { setError(mergeError instanceof Error ? mergeError.message : "Не удалось объединить карточки"); }
    finally { setSaving(false); }
  }

  function startEdit(customer: Customer) {
    setEditing(customer); setEditName(customer.name); setEditNotes(customer.notes ?? ""); setEditActive(customer.isActive ?? true); setLogoFile(null); setError(null);
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return; setError(null); setSaving(true);
    try {
      const response = await fetch(`/api/customers/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editName.trim(), notes: editNotes.trim() || null, isActive: editActive }) });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Ошибка сохранения");
      if (logoFile) {
        const form = new FormData(); form.set("file", logoFile);
        const logoResponse = await fetch(`/api/customers/${editing.id}/logo`, { method: "POST", body: form });
        if (!logoResponse.ok) throw new Error("Данные сохранены, но логотип загрузить не удалось");
      }
      setEditing(null); setNotice("Карточка заказчика обновлена"); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Ошибка сохранения"); }
    finally { setSaving(false); }
  }

  async function removeLogo() {
    if (!editing?.logoUrl) return; setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/customers/${editing.id}/logo`, { method: "DELETE" });
      if (!response.ok) throw new Error("Не удалось удалить логотип");
      setEditing({ ...editing, logoUrl: null }); await load();
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Не удалось удалить логотип"); }
    finally { setSaving(false); }
  }

  const activeCount = customers.filter((customer) => customer.isActive !== false && !customer.mergedInto).length;
  const mergedCount = customers.filter((customer) => customer.mergedInto).length;

  return (
    <AppShell title="Админка · Заказчики">
      {forbidden ? <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg.</div> : (
        <main className="mx-auto grid max-w-[1480px] gap-5 pb-12">
          <Link href="/admin" className="w-fit rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400">← Админка</Link>
          <section className="overflow-hidden rounded-[28px] border border-violet-200 bg-[linear-gradient(120deg,#fff_0%,#fff_58%,#f1eaff_100%)] shadow-sm">
            <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-8">
              <div><div className="text-xs font-black uppercase tracking-[0.2em] text-violet-700">Единый справочник</div><h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 md:text-4xl">Заказчики без дублей</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">Заявки, проекты и отдельные сметы привязаны к одной карточке. LTV и история клиента больше не дробятся из-за регистра, пробелов или знаков.</p></div>
              <div className="grid grid-cols-3 gap-2">{[["Активных", activeCount], ["Дублей", mergeData.summary.duplicateCards], ["Объединено", mergedCount]].map(([label, value]) => <div key={label} className="min-w-24 rounded-2xl border border-white/80 bg-white/80 p-3 shadow-sm"><div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</div><div className="mt-1 text-2xl font-black text-zinc-950">{value}</div></div>)}</div>
            </div>
          </section>
          {(error || notice) && <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? notice}</div>}

          <section className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black text-zinc-950">Найденные совпадения</h2><p className="mt-1 text-sm text-zinc-500">Основная карточка сохраняет название и получает всю историю выбранных дублей.</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${mergeData.summary.groups ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{mergeData.summary.groups ? `${mergeData.summary.groups} групп требуют решения` : "Всё чисто"}</span></div>
            {loading ? <div className="mt-5"><ListSkeleton rows={3} /></div> : mergeData.groups.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-5 py-8 text-center text-sm text-emerald-900">Дублей по написанию не найдено. Новые варианты автоматически попадут в существующую карточку.</div> : (
              <div className="mt-5 grid gap-4">{mergeData.groups.map((group) => {
                const targetId = targets[group.identityKey] ?? group.suggestedTargetId;
                const target = group.customers.find((customer) => customer.id === targetId)!;
                const totals = group.customers.reduce((sum, customer) => sum + usageTotal(customer._count), 0);
                return <article key={group.identityKey} className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/30">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 px-4 py-3"><div><span className="text-xs font-black uppercase tracking-wider text-amber-800">Одна компания</span><span className="ml-3 text-sm text-zinc-600">{group.customers.length} карточки · {totals} связанных записей</span></div><span className="rounded-lg bg-white px-2 py-1 font-mono text-xs text-zinc-500">{group.identityKey}</span></div>
                  <div className="grid divide-y divide-zinc-100 bg-white">{group.customers.map((customer) => <label key={customer.id} className={`grid cursor-pointer gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center ${customer.id === targetId ? "bg-violet-50/70" : "hover:bg-zinc-50"}`}><input type="radio" name={`target-${group.identityKey}`} checked={customer.id === targetId} onChange={() => { setTargets((current) => ({ ...current, [group.identityKey]: customer.id })); setConfirming(null); }} className="size-4 accent-violet-700" /><div className="flex min-w-0 items-center gap-3"><CustomerMark customer={customer} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-zinc-950">{customer.name}</strong>{customer.id === group.suggestedTargetId && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-700">рекомендуем</span>}</div><div className="mt-1 text-xs text-zinc-500">Создана {new Date(customer.createdAt).toLocaleDateString("ru-RU")}{customer.isActive ? " · активна" : " · скрыта"}</div></div></div><div className="flex gap-3 text-xs text-zinc-600 sm:justify-end"><span><b className="text-zinc-950">{customer._count.orders}</b> заявок</span><span><b className="text-zinc-950">{customer._count.projects}</b> проектов</span><span><b className="text-zinc-950">{customer._count.standaloneEstimates}</b> смет</span></div></label>)}</div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-100 px-4 py-3"><p className="text-xs text-zinc-600">Основной станет <b>«{target.name}»</b>. Исходные карточки останутся в журнале.</p>{confirming === group.identityKey ? <div className="flex items-center gap-2"><button type="button" onClick={() => setConfirming(null)} className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-600">Отмена</button><button type="button" disabled={saving} onClick={() => void mergeGroup(group)} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Объединяем…" : "Подтвердить объединение"}</button></div> : <button type="button" onClick={() => setConfirming(group.identityKey)} className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-black text-zinc-950 hover:bg-yellow-300">Объединить {group.customers.length} карточки</button>}</div>
                </article>;
              })}</div>
            )}
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm"><div className="border-b border-zinc-100 p-5"><h2 className="text-xl font-black text-zinc-950">Справочник</h2><p className="mt-1 text-sm text-zinc-500">{customers.length} карточек, включая скрытые и объединённые.</p></div>{loading ? <div className="p-5"><ListSkeleton rows={6} /></div> : <div className="divide-y divide-zinc-100">{customers.map((customer) => <div key={customer.id} className={`grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center ${customer.mergedInto ? "bg-zinc-50 opacity-70" : ""}`}><CustomerMark customer={customer} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-zinc-950">{customer.name}</strong>{customer.mergedInto ? <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700">объединён с «{customer.mergedInto.name}»</span> : customer.isActive !== false ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">активен</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">скрыт</span>}</div><div className="mt-1 truncate text-xs text-zinc-500">{customer.notes || "Без заметок"} · {usageTotal(customer.counts)} связанных записей</div></div>{!customer.mergedInto && <button type="button" onClick={() => startEdit(customer)} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-700 hover:border-zinc-400">Изменить</button>}</div>)}</div>}</div>
            <div className="grid content-start gap-5"><div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-zinc-950">Новый заказчик</h2><form onSubmit={create} className="mt-4 grid gap-3"><label className="grid gap-1 text-xs font-bold text-zinc-600">Название<input value={createName} onChange={(event) => setCreateName(event.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-normal text-zinc-950 outline-none focus:border-violet-500" placeholder="Например, Омск Энерго" /></label><label className="grid gap-1 text-xs font-bold text-zinc-600">Заметки<input value={createNotes} onChange={(event) => setCreateNotes(event.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-normal text-zinc-950 outline-none focus:border-violet-500" placeholder="Необязательно" /></label><button type="submit" disabled={saving || createName.trim().length < 2} className="mt-1 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-yellow-300 disabled:opacity-50">Создать карточку</button></form></div><div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-zinc-950">Последние объединения</h2>{mergeData.history.length ? <div className="mt-4 grid gap-4">{mergeData.history.slice(0, 8).map((entry) => <div key={entry.id} className="border-l-2 border-violet-300 pl-3"><div className="text-sm font-bold text-zinc-900">{entry.sourceName} → {entry.targetName}</div><div className="mt-1 text-xs text-zinc-500">{new Date(entry.createdAt).toLocaleString("ru-RU")} · {entry.actor.displayName}</div></div>)}</div> : <p className="mt-3 text-sm text-zinc-500">Операций пока не было.</p>}</div></div>
          </section>

          {editing && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-violet-700">Карточка заказчика</div><h2 className="mt-1 text-2xl font-black text-zinc-950">Редактирование</h2></div><button type="button" onClick={() => setEditing(null)} className="grid size-10 place-items-center rounded-full bg-zinc-100 text-xl text-zinc-600">×</button></div><form onSubmit={saveEdit} className="mt-5 grid gap-4"><label className="grid gap-1 text-xs font-bold text-zinc-600">Название<input required value={editName} onChange={(event) => setEditName(event.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-normal text-zinc-950" /></label><div className="rounded-2xl border border-zinc-200 p-3"><div className="flex items-center gap-3"><CustomerMark customer={editing} large /><div className="min-w-0"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} className="w-full text-xs" />{editing.logoUrl && <button type="button" onClick={() => void removeLogo()} disabled={saving} className="mt-2 text-xs font-bold text-red-700">Удалить логотип</button>}</div></div></div><label className="grid gap-1 text-xs font-bold text-zinc-600">Заметки<textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} rows={3} className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-normal text-zinc-950" /></label><label className="flex items-center gap-2 rounded-xl bg-zinc-50 p-3 text-sm font-medium text-zinc-800"><input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} className="size-4 accent-violet-700" />Доступен в новых заявках</label>{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}<div className="flex gap-2"><button type="submit" disabled={saving} className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-zinc-950 disabled:opacity-50">{saving ? "Сохраняем…" : "Сохранить"}</button><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-700">Отмена</button></div></form></div></div>, document.body)}
        </main>
      )}
    </AppShell>
  );
}
