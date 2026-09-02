"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { ProjectDetailSkeleton } from "@/app/_ui/Skeleton";
import {
  ProjectModuleBoundary,
  ProjectModuleSkeleton,
} from "@/app/projects/[id]/ProjectModuleBoundary";

const ProjectEstimatePanel = dynamic(
  () =>
    import("@/app/projects/[id]/ProjectEstimatePanel").then(
      (module) => module.ProjectEstimatePanel,
    ),
  { ssr: false, loading: () => <ProjectModuleSkeleton title="Смета" /> },
);

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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function EstimateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 3.5h10A2.5 2.5 0 0 1 19.5 6v12A2.5 2.5 0 0 1 17 20.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Z" />
      <path d="M8 8h8M8 12h3M14 12h2M8 16h3M14 16h2" />
    </svg>
  );
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
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState("");
  const [titleSaving, setTitleSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/standalone-estimates/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as { estimate: EstimateDetails };
      setEstimate(payload.estimate);
      setTitleDraft(payload.estimate.title);
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

  React.useEffect(() => {
    if (!convertOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setConvertOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, convertOpen]);

  async function saveTitle() {
    if (!estimate || estimate.convertedAt || titleSaving) return;
    const title = titleDraft.trim();
    if (!title || title === estimate.title) {
      setTitleDraft(estimate.title);
      setEditingTitle(false);
      return;
    }
    setTitleSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/standalone-estimates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as {
        estimate: { title: string; updatedAt: string };
      };
      setEstimate((current) => current
        ? { ...current, title: payload.estimate.title, updatedAt: payload.estimate.updatedAt }
        : current);
      setTitleDraft(payload.estimate.title);
      setEditingTitle(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось переименовать смету");
    } finally {
      setTitleSaving(false);
    }
  }

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

  const customerName = estimate?.customer?.name ?? estimate?.leadCustomerName ?? "Заказчик не указан";
  const readOnly = Boolean(estimate?.convertedAt);

  return (
    <AppShell title={estimate?.title ?? "Независимая смета"}>
      {loading ? (
        <ProjectDetailSkeleton />
      ) : error && !estimate ? (
        <div className="border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">{error}</div>
      ) : estimate ? (
        <main className="standalone-estimate-page">
          <section className="standalone-estimate-hero">
            <div className="standalone-estimate-hero__mascot" aria-hidden="true">
              <span>Считаем точно!</span>
              <Image src="/project-mascot-v2.png" alt="" width={768} height={512} priority />
            </div>
            <div className="standalone-estimate-hero__surface">
              <div className="standalone-estimate-hero__primary">
                <div className="standalone-estimate-hero__crumbs">
                  <Link href="/work?view=estimates" aria-label="К независимым сметам">←</Link>
                  <span>Независимая смета</span>
                  <i aria-hidden>/</i>
                  <span>{readOnly ? "перенесена в проект" : "черновик"}</span>
                </div>

                {editingTitle && !readOnly ? (
                  <input
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={() => void saveTitle()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setTitleDraft(estimate.title);
                        setEditingTitle(false);
                      }
                    }}
                    className="standalone-estimate-hero__title standalone-estimate-hero__title-input"
                    aria-label="Название сметы"
                    maxLength={300}
                    disabled={titleSaving}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="standalone-estimate-hero__title"
                    onClick={() => !readOnly && setEditingTitle(true)}
                    disabled={readOnly}
                    title={readOnly ? undefined : "Нажмите, чтобы переименовать"}
                  >
                    {estimate.title}
                  </button>
                )}

                <div className="standalone-estimate-hero__meta">
                  <span><small>Заказчик</small><strong>{customerName}</strong></span>
                  <span><small>Ответственный</small><strong>{estimate.owner.displayName}</strong></span>
                  <span><small>Обновлено</small><strong>{formatDate(estimate.updatedAt)}</strong></span>
                </div>
              </div>

              <div className="standalone-estimate-hero__actions">
                {estimate.convertedProjectId ? (
                  <Link href={`/projects/${estimate.convertedProjectId}`}>
                    Открыть проект <span aria-hidden>→</span>
                  </Link>
                ) : (
                  <button type="button" onClick={() => setConvertOpen(true)}>
                    Превратить в проект <span aria-hidden>→</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {error ? (
            <div className="standalone-estimate-alert" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Закрыть сообщение">×</button>
            </div>
          ) : null}

          <section className="standalone-estimate-workspace">
            <header>
              <span className="standalone-estimate-workspace__icon"><EstimateIcon /></span>
              <div>
                <h2>Смета</h2>
                <p>Строки, расходы и итоговый расчёт</p>
              </div>
              <span className="standalone-estimate-workspace__mode">
                {readOnly ? "Только просмотр" : "Редактирование онлайн"}
              </span>
            </header>
            <div className="standalone-estimate-workspace__body">
              <ProjectModuleBoundary title="Смета" resetKey={`${estimate.id}:estimate`}>
                <ProjectEstimatePanel
                  projectId={estimate.id}
                  apiBase={`/api/standalone-estimates/${estimate.id}`}
                  standalone
                  workspaceMode
                  readOnly={readOnly}
                  estimateGridEnabled
                />
              </ProjectModuleBoundary>
            </div>
          </section>

          {convertOpen ? (
            <div
              className="standalone-estimate-convert"
              onMouseDown={() => !busy && setConvertOpen(false)}
              role="presentation"
            >
              <form
                onSubmit={convert}
                onMouseDown={(event) => event.stopPropagation()}
                className="standalone-estimate-convert__dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="standalone-estimate-convert-title"
              >
                <div className="standalone-estimate-convert__head">
                  <div>
                    <span>Следующий этап</span>
                    <h2 id="standalone-estimate-convert-title">Создать проект</h2>
                  </div>
                  <button type="button" disabled={busy} onClick={() => setConvertOpen(false)} aria-label="Закрыть">×</button>
                </div>
                <p className="standalone-estimate-convert__copy">
                  Версии, разделы, строки, расходы и финансовые настройки перейдут в новый проект без повторного ввода.
                </p>

                <label className="standalone-estimate-convert__field">
                  <span>Существующий заказчик</span>
                  <select
                    value={customerId}
                    onChange={(event) => {
                      setCustomerId(event.target.value);
                      if (event.target.value) setNewCustomerName("");
                    }}
                  >
                    <option value="">Выбрать из списка…</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </label>

                <div className="standalone-estimate-convert__divider"><span>или новый</span></div>

                <label className="standalone-estimate-convert__field">
                  <span>Новый заказчик</span>
                  <input
                    value={newCustomerName}
                    disabled={Boolean(customerId)}
                    onChange={(event) => setNewCustomerName(event.target.value)}
                    placeholder="Название компании"
                  />
                </label>

                <div className="standalone-estimate-convert__note">
                  <strong>После создания</strong>
                  <span>Смета станет основным финансовым документом проекта, а независимый расчёт останется в истории.</span>
                </div>

                <div className="standalone-estimate-convert__actions">
                  <button type="button" disabled={busy} onClick={() => setConvertOpen(false)}>Отмена</button>
                  <button type="submit" disabled={busy || (!customerId && !newCustomerName.trim())}>
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
