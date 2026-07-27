"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { ProjectDetailSkeleton } from "@/app/_ui/Skeleton";
import { ProjectEstimatePanel } from "@/app/projects/[id]/ProjectEstimatePanel";

type EstimateDetails = {
  id: string;
  title: string;
  leadCustomerName: string | null;
  convertedAt: string | null;
  convertedProjectId: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; logoUrl: string | null } | null;
  owner: { id: string; displayName: string };
};

type CustomerOption = { id: string; name: string };

async function responseMessage(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message ?? "Не удалось выполнить действие";
}

export default function StandaloneEstimatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [estimate, setEstimate] = React.useState<EstimateDetails | null>(null);
  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [convertOpen, setConvertOpen] = React.useState(false);
  const [customerId, setCustomerId] = React.useState("");
  const [newCustomerName, setNewCustomerName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/standalone-estimates/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as { estimate: EstimateDetails };
      setEstimate(payload.estimate);
      setCustomerId(payload.estimate.customer?.id ?? "");
      setNewCustomerName(payload.estimate.leadCustomerName ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить смету");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
    void fetch("/api/customers", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { customers?: CustomerOption[] } | null) => {
        setCustomers(Array.isArray(payload?.customers) ? payload!.customers! : []);
      });
  }, [load]);

  async function convert(event: React.FormEvent) {
    event.preventDefault();
    if (!customerId && !newCustomerName.trim()) {
      setError("Выберите существующего заказчика или укажите нового");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/standalone-estimates/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerId
          ? { customerId }
          : { customerName: newCustomerName.trim() }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as { project: { id: string } };
      router.push(`/projects/${payload.project.id}`);
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : "Не удалось создать проект");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={estimate?.title ?? "Независимая смета"}>
      {loading ? (
        <ProjectDetailSkeleton />
      ) : error && !estimate ? (
        <div className="border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">{error}</div>
      ) : estimate ? (
        <main className="space-y-5">
          <Link href="/work?view=estimates" className="inline-flex items-center gap-2 text-sm font-bold text-violet-700 hover:text-violet-900">
            <span aria-hidden>←</span>
            К рабочей очереди
          </Link>

          <section className="border border-zinc-300 border-t-4 border-t-yellow-400 bg-white p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-700">
                  Независимая смета
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-5xl">
                  {estimate.title}
                </h1>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
                  <span>
                    Заказчик: <b className="text-zinc-950">{estimate.customer?.name ?? estimate.leadCustomerName ?? "пока не указан"}</b>
                  </span>
                  <span>
                    Ответственный: <b className="text-zinc-950">{estimate.owner.displayName}</b>
                  </span>
                  <span>
                    Обновлено: <b className="text-zinc-950">{new Date(estimate.updatedAt).toLocaleDateString("ru-RU")}</b>
                  </span>
                </div>
              </div>
              {estimate.convertedProjectId ? (
                <Link
                  href={`/projects/${estimate.convertedProjectId}`}
                  className="inline-flex min-h-12 items-center justify-center bg-zinc-950 px-5 text-sm font-black text-white hover:bg-violet-700"
                >
                  Открыть созданный проект
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setConvertOpen(true)}
                  className="inline-flex min-h-12 items-center justify-center bg-yellow-400 px-5 text-sm font-black text-zinc-950 transition-colors hover:bg-zinc-950 hover:text-white"
                >
                  Превратить в проект →
                </button>
              )}
            </div>
          </section>

          {error ? (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>
          ) : null}

          <ProjectEstimatePanel
            projectId={estimate.id}
            apiBase={`/api/standalone-estimates/${estimate.id}`}
            standalone
            readOnly={Boolean(estimate.convertedAt)}
          />

          {convertOpen ? (
            <div
              className="fixed inset-0 z-[100] grid place-items-center bg-zinc-950/50 p-4 backdrop-blur-sm"
              onMouseDown={() => !busy && setConvertOpen(false)}
            >
              <form
                onSubmit={convert}
                onMouseDown={(event) => event.stopPropagation()}
                className="w-full max-w-xl border border-zinc-300 border-t-4 border-t-yellow-400 bg-white p-6 shadow-2xl"
              >
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-700">Следующий этап</div>
                <h2 className="mt-2 text-3xl font-black text-zinc-950">Создать полноценный проект</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Все разделы, строки, внутренние расходы и финансовые настройки сметы будут перенесены без повторного ввода.
                </p>

                <label className="mt-6 block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-600">
                    Существующий заказчик
                  </span>
                  <select
                    value={customerId}
                    onChange={(event) => {
                      setCustomerId(event.target.value);
                      if (event.target.value) setNewCustomerName("");
                    }}
                    className="min-h-12 w-full border border-zinc-300 bg-white px-3 text-base font-semibold text-zinc-950 outline-none focus:border-violet-600"
                  >
                    <option value="">Выбрать из списка…</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </label>

                <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <span className="h-px flex-1 bg-zinc-200" />или новый<span className="h-px flex-1 bg-zinc-200" />
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-600">
                    Новый заказчик
                  </span>
                  <input
                    value={newCustomerName}
                    disabled={Boolean(customerId)}
                    onChange={(event) => setNewCustomerName(event.target.value)}
                    placeholder="Название компании"
                    className="min-h-12 w-full border border-zinc-300 px-3 text-base font-semibold text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-violet-600 disabled:bg-zinc-100"
                  />
                </label>

                <div className="mt-7 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConvertOpen(false)}
                    className="min-h-12 border border-zinc-300 bg-white px-5 text-sm font-black text-zinc-900 hover:border-zinc-950"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-12 bg-yellow-400 px-5 text-sm font-black text-zinc-950 hover:bg-zinc-950 hover:text-white disabled:opacity-50"
                  >
                    {busy ? "Создаём…" : "Создать проект"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </main>
      ) : null}
    </AppShell>
  );
}
