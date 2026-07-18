"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { createPortal } from "react-dom";

import { AppShell } from "@/app/_ui/AppShell";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import {
  PROJECT_BALL_LABEL,
  PROJECT_STATUS_GROUP_LABEL,
  PROJECT_STATUS_LABEL,
} from "@/lib/project-ui-labels";
import { useAuth } from "@/app/providers";
import type { ProjectBall, ProjectStatus } from "@prisma/client";

type ProjectCard = {
  id: string;
  title: string;
  status: ProjectStatus;
  ball: ProjectBall;
  archivedAt: string | null;
  archiveNote: string | null;
  eventStartDate: string | null;
  eventEndDate: string | null;
  eventDateConfirmed: boolean;
  updatedAt: string;
  createdAt: string;
  customer: { id: string; name: string };
  owner: { id: string; displayName: string };
  _count: { orders: number };
  finance: {
    revenueTotal: number;
    marginAfterTax: number;
    marginAfterTaxPct: number;
  };
};

const PROJECT_SORT_OPTIONS = [
  { value: "updated_desc", label: "Новые изменения" },
  { value: "updated_asc", label: "Старые изменения" },
  { value: "created_desc", label: "Новые проекты" },
  { value: "created_asc", label: "Старые проекты" },
  { value: "title_asc", label: "А → Я" },
] as const;

const PROJECT_BALL_FILTERS: Array<{ value: "all" | ProjectBall; label: string }> = [
  { value: "all", label: "Все мячи" },
  ...(Object.keys(PROJECT_BALL_LABEL) as ProjectBall[]).map((b) => ({
    value: b,
    label: PROJECT_BALL_LABEL[b],
  })),
];

type ProjectStageFilter = "all" | "preparation" | "execution" | "completion";

const PROJECT_STAGE_FILTERS: Array<{ value: ProjectStageFilter; label: string }> = [
  { value: "all", label: "Все этапы" },
  { value: "preparation", label: PROJECT_STATUS_GROUP_LABEL.preparation },
  { value: "execution", label: PROJECT_STATUS_GROUP_LABEL.execution },
  { value: "completion", label: PROJECT_STATUS_GROUP_LABEL.completion },
];

function buildProjectsListQuery(args: {
  tab: "active" | "archive";
  sort: string;
  q: string;
  stage: string;
  ball: string;
}): string {
  const p = new URLSearchParams();
  if (args.tab === "archive") p.set("archive", "1");
  if (args.sort && args.sort !== "updated_desc") p.set("sort", args.sort);
  const q = args.q.trim();
  if (q) p.set("q", q);
  if (args.stage !== "all") p.set("stage", args.stage);
  if (args.ball !== "all") p.set("ball", args.ball);
  return p.toString();
}

function buildProjectsPageQuery(args: {
  tab: "active" | "archive";
  sort: string;
  q: string;
  stage: string;
  ball: string;
}): string {
  const p = new URLSearchParams();
  if (args.tab === "archive") p.set("tab", "archive");
  if (args.sort && args.sort !== "updated_desc") p.set("sort", args.sort);
  const q = args.q.trim();
  if (q) p.set("q", q);
  if (args.stage !== "all") p.set("stage", args.stage);
  if (args.ball !== "all") p.set("ball", args.ball);
  return p.toString();
}

type CustomerOpt = { id: string; name: string };

function tabFromSearchParams(sp: { get: (k: string) => string | null }): "active" | "archive" {
  const t = sp.get("tab");
  if (t === "archive" || sp.get("archive") === "1") return "archive";
  return "active";
}

function parseStageFilter(raw: string | null): ProjectStageFilter {
  if (raw === "preparation" || raw === "execution" || raw === "completion") return raw;
  return "all";
}

function parseBallFilter(raw: string | null): "all" | ProjectBall {
  if (!raw || raw === "all") return "all";
  if (raw in PROJECT_BALL_LABEL) return raw as ProjectBall;
  return "all";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function projectDateLine(project: ProjectCard): string | null {
  if (!project.eventStartDate && !project.eventEndDate) return null;
  if (project.eventStartDate && project.eventEndDate && project.eventStartDate.slice(0, 10) !== project.eventEndDate.slice(0, 10)) {
    return `${fmtDate(project.eventStartDate)} — ${fmtDate(project.eventEndDate)}`;
  }
  return fmtDate(project.eventStartDate ?? project.eventEndDate ?? "");
}

function projectArchiveHeader(status: ProjectStatus): null | {
  title: string;
  subtitle: string;
  icon: string;
  className: string;
  iconClassName: string;
  muted: boolean;
} {
  if (status === "COMPLETED") {
    return {
      title: "Закрыто",
      subtitle: "Проект завершён",
      icon: "✓",
      className: "bg-violet-50/80 text-violet-800",
      iconClassName: "border-violet-300 bg-violet-100/70 text-violet-700",
      muted: false,
    };
  }
  if (status === "CANCELLED") {
    return {
      title: "Отменено",
      subtitle: "Проект отменён",
      icon: "—",
      className: "bg-zinc-100/80 text-zinc-500",
      iconClassName: "border-zinc-300 bg-zinc-100/70 text-zinc-500",
      muted: true,
    };
  }
  return null;
}

function ProjectsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useAuth();
  const role = state.status === "authenticated" ? state.user.role : null;
  const forbidden = state.status === "authenticated" && role !== "WOWSTORG";

  const [tab, setTab] = React.useState<"active" | "archive">(() => tabFromSearchParams(searchParams));

  React.useEffect(() => {
    setTab(tabFromSearchParams(searchParams));
  }, [searchParams]);

  const [sort, setSort] = React.useState(() => searchParams.get("sort") || "updated_desc");
  const [qInput, setQInput] = React.useState(() => searchParams.get("q") ?? "");
  const [qDebounced, setQDebounced] = React.useState(() => searchParams.get("q") ?? "");
  const [stageFilter, setStageFilter] = React.useState<ProjectStageFilter>(() =>
    parseStageFilter(searchParams.get("stage")),
  );
  const [ballFilter, setBallFilter] = React.useState<"all" | ProjectBall>(() => parseBallFilter(searchParams.get("ball")));

  React.useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(qInput), 320);
    return () => window.clearTimeout(t);
  }, [qInput]);

  React.useEffect(() => {
    setSort(searchParams.get("sort") || "updated_desc");
    setQInput(searchParams.get("q") ?? "");
    setQDebounced(searchParams.get("q") ?? "");
    setStageFilter(parseStageFilter(searchParams.get("stage")));
    setBallFilter(parseBallFilter(searchParams.get("ball")));
  }, [searchParams]);

  const [projects, setProjects] = React.useState<ProjectCard[]>([]);
  const [listError, setListError] = React.useState<string | null>(null);
  const [customers, setCustomers] = React.useState<CustomerOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [completeConfirmId, setCompleteConfirmId] = React.useState<string | null>(null);
  const [projectActionBusyId, setProjectActionBusyId] = React.useState<string | null>(null);
  const [projectActionError, setProjectActionError] = React.useState<string | null>(null);
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [customerInput, setCustomerInput] = React.useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = React.useState(false);
  const customerInputRef = React.useRef<HTMLDivElement | null>(null);

  const customerInputTrim = customerInput.trim();
  const customerFiltered = React.useMemo(() => {
    if (!customerInputTrim) return customers.slice(0, 12);
    const q = customerInputTrim.toLocaleLowerCase("ru");
    return customers.filter((c) => c.name.toLocaleLowerCase("ru").includes(q)).slice(0, 12);
  }, [customers, customerInputTrim]);
  const matchedCustomer = React.useMemo(
    () =>
      customerInputTrim
        ? customers.find((c) => c.name.localeCompare(customerInputTrim, undefined, { sensitivity: "accent" }) === 0)
        : null,
    [customers, customerInputTrim],
  );

  const loadProjects = React.useCallback(() => {
    if (state.status === "loading") return;
    if (state.status !== "authenticated" || role !== "WOWSTORG") {
      setLoading(false);
      return;
    }
    const qs = buildProjectsListQuery({
      tab,
      sort,
      q: qDebounced,
      stage: stageFilter,
      ball: ballFilter,
    });
    setLoading(true);
    setListError(null);
    fetch(`/api/projects${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as
          | { projects?: ProjectCard[]; error?: { message?: string } }
          | null;
        if (!r.ok) {
          setProjects([]);
          setListError(data?.error?.message ?? `Не удалось загрузить проекты (${r.status})`);
          return;
        }
        setListError(null);
        setProjects(data?.projects ?? []);
      })
      .catch(() => {
        setProjects([]);
        setListError("Сеть или сервер недоступны. Проверьте подключение и попробуйте снова.");
      })
      .finally(() => setLoading(false));
  }, [state.status, role, tab, sort, qDebounced, stageFilter, ballFilter]);

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    const pageQs = buildProjectsPageQuery({
      tab,
      sort,
      q: qDebounced,
      stage: stageFilter,
      ball: ballFilter,
    });
    router.replace(pageQs ? `${pathname}?${pageQs}` : pathname, { scroll: false });
  }, [state.status, role, tab, sort, qDebounced, stageFilter, ballFilter, pathname, router]);

  React.useEffect(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    fetch("/api/customers?all=true", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { customers?: CustomerOpt[] } | null) => {
        setCustomers(data?.customers ?? []);
      })
      .catch(() => setCustomers([]));
  }, [state.status, role]);

  React.useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (target && customerInputRef.current && !customerInputRef.current.contains(target)) {
        setCustomerDropdownOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function openCreateModal() {
    setCustomerDropdownOpen(false);
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCustomerDropdownOpen(false);
    setCreateModalOpen(false);
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !customerInputTrim) return;
    setCreateBusy(true);
    try {
      const match =
        matchedCustomer ??
        customers.find((c) => c.id === customerId);
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ...(match ? { customerId: match.id } : { customerName: customerInputTrim }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.project?.id) {
        setTitle("");
        setCustomerId("");
        setCustomerInput("");
        closeCreateModal();
        router.push(`/projects/${data.project.id}`);
        return;
      }
    } finally {
      setCreateBusy(false);
    }
  }

  async function completeProject(project: ProjectCard) {
    setProjectActionBusyId(project.id);
    setProjectActionError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(data?.error?.message ?? `Ошибка ${response.status}`);
      setCompleteConfirmId(null);
      loadProjects();
    } catch (error) {
      setProjectActionError(error instanceof Error ? error.message : "Не удалось завершить проект");
    } finally {
      setProjectActionBusyId(null);
    }
  }

  return (
    <AppShell title="Проекты">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-lg border border-zinc-300 border-t-4 border-t-yellow-400 bg-white p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-3xl font-black leading-none text-zinc-950 sm:text-4xl">Проекты</h1>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-lg border border-yellow-400 bg-yellow-400 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-yellow-300"
                >
                  Создать проект
                </button>
                <div
                  className="inline-flex shrink-0 items-center rounded-lg border border-zinc-200 bg-zinc-50 p-1"
                  role="group"
                  aria-label="Область проектов"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setTab("active");
                      setSort("updated_desc");
                    }}
                    className={[
                      "rounded-md px-4 py-2.5 text-sm font-black transition-colors",
                      tab === "active"
                        ? "bg-zinc-950 text-white"
                        : "text-zinc-700 hover:bg-white/80 hover:text-zinc-950",
                    ].join(" ")}
                  >
                    Активные
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("archive");
                      setSort("updated_desc");
                    }}
                    className={[
                      "rounded-md px-4 py-2.5 text-sm font-black transition-colors",
                      tab === "archive"
                        ? "bg-zinc-950 text-white"
                        : "text-zinc-700 hover:bg-white/80 hover:text-zinc-950",
                    ].join(" ")}
                  >
                    Архив
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-zinc-200 pt-4">
              <div className="grid gap-2 xl:grid-cols-[minmax(22rem,1fr)_minmax(10rem,13rem)_minmax(12rem,15rem)_minmax(9rem,12rem)]">
                <input
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Найти проект"
                  className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                  aria-label="Найти проект"
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                  aria-label="Сортировка"
                >
                  {PROJECT_SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(parseStageFilter(e.target.value))}
                  className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                  aria-label="Статус"
                >
                  {PROJECT_STAGE_FILTERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={ballFilter}
                  onChange={(e) => setBallFilter(parseBallFilter(e.target.value))}
                  className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                  aria-label="Мяч"
                >
                  {PROJECT_BALL_FILTERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {listError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <div className="font-semibold">Не удалось загрузить список</div>
              <p className="mt-1 text-red-800">{listError}</p>
              <p className="mt-2 text-xs text-red-700/90">
                Если недавно обновляли приложение, на базе должна быть миграция с полем{" "}
                <code className="rounded bg-red-100/80 px-1">Project.archiveNote</code> — выполните{" "}
                <code className="rounded bg-red-100/80 px-1">npx prisma migrate deploy</code> на окружении с БД.
              </p>
            </div>
          ) : null}

          {projectActionError ? (
            <div className="flex items-center justify-between gap-3 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <span>{projectActionError}</span>
              <button type="button" className="font-bold underline" onClick={() => setProjectActionError(null)}>
                Закрыть
              </button>
            </div>
          ) : null}

          {loading ? (
            <ListSkeleton rows={5} />
          ) : !listError && projects.length === 0 ? (
            <div className="text-sm text-zinc-600">Пока нет проектов.</div>
          ) : !listError ? (
            <ul className="grid gap-3">
              {projects.map((p) => {
                const archiveHeader = tab === "archive" ? projectArchiveHeader(p.status) : null;
                const isCancelledArchive = Boolean(archiveHeader?.muted);
                return (
                  <li
                    key={p.id}
                    className={[
                      "overflow-hidden rounded-lg border bg-white transition-colors duration-150",
                      isCancelledArchive ? "border-zinc-200 opacity-80 hover:opacity-100" : "border-zinc-300 hover:border-zinc-950",
                    ].join(" ")}
                  >
                    <Link
                      href={`/projects/${p.id}`}
                      className={[
                        "group block p-0 transition-colors duration-150",
                        isCancelledArchive
                          ? "bg-zinc-50"
                          : "bg-white",
                      ].join(" ")}
                    >
                    {archiveHeader ? (
                      <div className={["flex items-center gap-3 px-5 py-4", archiveHeader.className].join(" ")}>
                        <div
                          className={[
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-xl font-black",
                            archiveHeader.iconClassName,
                          ].join(" ")}
                        >
                          {archiveHeader.icon}
                        </div>
                        <div>
                          <div className="text-sm font-black">{archiveHeader.title}</div>
                          <div className="mt-0.5 text-xs font-semibold opacity-85">{archiveHeader.subtitle}</div>
                        </div>
                      </div>
                    ) : null}
                    <div className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2
                            className={[
                              "min-w-0 text-xl font-black leading-tight",
                              isCancelledArchive ? "text-zinc-500 group-hover:text-zinc-700" : "text-zinc-950 group-hover:text-violet-800",
                            ].join(" ")}
                          >
                            {p.title}
                          </h2>
                          <span className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-bold text-zinc-600">
                            {p.customer.name}
                          </span>
                          {projectDateLine(p) ? (
                            <span className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-bold text-violet-800">
                              {projectDateLine(p)}
                              {p.eventDateConfirmed ? "" : " · черновик"}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span
                            className={[
                              "rounded-full border px-2.5 py-1 font-bold",
                              isCancelledArchive
                                ? "border-zinc-300 bg-zinc-100/80 text-zinc-500"
                                : "border-zinc-200 bg-white/75 text-zinc-700",
                            ].join(" ")}
                          >
                            {PROJECT_STATUS_LABEL[p.status]}
                          </span>
                          {isCancelledArchive ? (
                            <span className="rounded-full border border-zinc-300 bg-white/70 px-2.5 py-1 font-bold text-zinc-500">
                              Не учитывается
                            </span>
                          ) : null}
                          <span className="rounded-full border border-amber-200 bg-amber-50/85 px-2.5 py-1 font-bold text-amber-900">
                            {PROJECT_BALL_LABEL[p.ball]}
                          </span>
                          <span className="rounded-full border border-violet-200 bg-violet-50/85 px-2.5 py-1 font-bold text-violet-800">
                            {p._count.orders} заявок
                          </span>
                          <span className="rounded-full border border-zinc-200 bg-white/75 px-2.5 py-1 font-bold text-zinc-600">
                            {p.owner.displayName}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 border-l border-zinc-200 pl-3 text-xs font-bold tabular-nums text-zinc-500">
                        {fmtDate(p.updatedAt)}
                      </div>
                    </div>
                    {tab === "archive" && p.archiveNote?.trim() ? (
                      <p className="mt-3 rounded-2xl border border-zinc-100 bg-white/70 px-3 py-2 text-sm text-zinc-700 whitespace-pre-wrap">
                        {p.archiveNote.trim()}
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
                      <div
                        className={[
                          "border-0 bg-white px-4 py-3",
                          isCancelledArchive
                            ? "text-zinc-500"
                            : "",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "text-[10px] font-black uppercase tracking-[0.16em]",
                            isCancelledArchive ? "text-zinc-400" : "text-violet-600",
                          ].join(" ")}
                        >
                          Выручка
                        </div>
                        <div
                          className={[
                            "mt-1 text-lg font-black",
                            isCancelledArchive ? "text-zinc-500" : "text-violet-950",
                          ].join(" ")}
                        >
                          {formatMoney(p.finance.revenueTotal)}
                        </div>
                      </div>
                      <div
                        className={[
                          "border-0 bg-white px-4 py-3",
                          isCancelledArchive
                            ? "text-zinc-500"
                            : p.finance.marginAfterTax < 0
                            ? ""
                            : "",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "text-[10px] font-black uppercase tracking-[0.16em]",
                            isCancelledArchive ? "text-zinc-400" : p.finance.marginAfterTax < 0 ? "text-red-700" : "text-emerald-700",
                          ].join(" ")}
                        >
                          Прибыль
                        </div>
                        <div
                          className={[
                            "mt-1 text-lg font-black",
                            isCancelledArchive ? "text-zinc-500" : p.finance.marginAfterTax < 0 ? "text-red-950" : "text-emerald-950",
                          ].join(" ")}
                        >
                          {formatMoney(p.finance.marginAfterTax)}
                        </div>
                      </div>
                      <div className="bg-white px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Маржа</div>
                        <div className={["mt-1 text-lg font-black", isCancelledArchive ? "text-zinc-500" : "text-zinc-950"].join(" ")}>
                          {Math.round(p.finance.marginAfterTaxPct).toLocaleString("ru-RU")}%
                        </div>
                      </div>
                    </div>
                    </div>
                    </Link>
                    {tab === "active" && p.status !== "COMPLETED" && p.status !== "CANCELLED" ? (
                      <div className="flex min-h-12 items-center justify-end gap-2 border-t border-zinc-300 bg-zinc-50 px-4 py-2.5">
                        {completeConfirmId === p.id ? (
                          <>
                            <span className="mr-auto text-xs font-medium text-zinc-600">Завершить проект и перенести его в архив?</span>
                            <button
                              type="button"
                              disabled={projectActionBusyId === p.id}
                              onClick={() => void completeProject(p)}
                              className="border border-zinc-950 bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                            >
                              {projectActionBusyId === p.id ? "Завершаем…" : "Да, завершить"}
                            </button>
                            <button
                              type="button"
                              disabled={projectActionBusyId === p.id}
                              onClick={() => setCompleteConfirmId(null)}
                              className="border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 transition-colors hover:border-zinc-500 disabled:opacity-50"
                            >
                              Отмена
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCompleteConfirmId(p.id)}
                            className="rounded border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                          >
                            Завершить проект
                          </button>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {createModalOpen && typeof document !== "undefined"
            ? createPortal(
            <div className="fixed inset-0 z-[1000] flex min-h-dvh items-center justify-center bg-zinc-950/45 px-4 py-6 backdrop-blur-md">
              <form
                onSubmit={createProject}
                className="w-full max-w-2xl overflow-visible rounded-[2rem] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,243,255,0.94))] p-5 shadow-[0_30px_100px_rgba(24,24,27,0.28)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-700">Новый проект</div>
                    <h2 className="mt-1 text-3xl font-black text-zinc-950">Создать проект</h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white/80 text-xl font-black leading-none text-zinc-500 shadow-sm transition hover:bg-white hover:text-zinc-950"
                    aria-label="Закрыть"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-5 grid gap-3">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-14 w-full rounded-2xl border border-zinc-200 bg-white/85 px-4 text-base font-bold text-zinc-950 shadow-sm outline-none placeholder:text-zinc-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    maxLength={300}
                    placeholder="Название проекта"
                    required
                  />

                  <div className="relative" ref={customerInputRef}>
                    <input
                      value={customerInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCustomerInput(value);
                        const trimmed = value.trim();
                        const match =
                          trimmed &&
                          customers.find((c) => c.name.localeCompare(trimmed, undefined, { sensitivity: "accent" }) === 0);
                        setCustomerId(match ? match.id : "");
                        setCustomerDropdownOpen(true);
                      }}
                      onFocus={() => setCustomerDropdownOpen(true)}
                      className="h-14 w-full rounded-2xl border border-zinc-200 bg-white/85 px-4 text-base font-bold text-zinc-950 shadow-sm outline-none placeholder:text-zinc-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                      placeholder="Заказчик"
                      autoComplete="off"
                      required
                    />
                    {customerDropdownOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 max-h-60 overflow-y-auto rounded-2xl border border-zinc-200 bg-white/95 py-1 shadow-[0_18px_50px_rgba(17,24,39,0.16)] backdrop-blur">
                        {customerFiltered.length === 0 ? (
                          <div className="px-4 py-3 text-sm font-medium text-zinc-500">
                            {customerInputTrim ? "Новый заказчик будет создан вместе с проектом" : "Список пуст"}
                          </div>
                        ) : (
                          customerFiltered.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-zinc-800 transition hover:bg-violet-50"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setCustomerInput(c.name);
                                setCustomerId(c.id);
                                setCustomerDropdownOpen(false);
                              }}
                            >
                              {c.name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm font-black text-zinc-700 shadow-sm transition hover:bg-white"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={createBusy || !title.trim() || !customerInputTrim}
                    className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(109,40,217,0.24)] transition hover:bg-violet-600 disabled:cursor-wait disabled:opacity-60"
                  >
                    {createBusy ? "Создаю..." : "Создать проект"}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
            : null}
        </div>
      )}
    </AppShell>
  );
}

function ProjectsPageFallback() {
  return (
    <AppShell title="Проекты">
      <ListSkeleton rows={5} />
    </AppShell>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsPageFallback />}>
      <ProjectsContent />
    </Suspense>
  );
}
