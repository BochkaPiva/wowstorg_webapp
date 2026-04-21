"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { PROJECT_BALL_LABEL, PROJECT_STATUS_LABEL } from "@/lib/project-ui-labels";
import { useAuth } from "@/app/providers";
import type { ProjectBall, ProjectStatus } from "@prisma/client";

type ProjectCard = {
  id: string;
  title: string;
  status: ProjectStatus;
  ball: ProjectBall;
  archivedAt: string | null;
  archiveNote: string | null;
  updatedAt: string;
  createdAt: string;
  customer: { id: string; name: string };
  owner: { id: string; displayName: string };
  _count: { orders: number };
};

const PROJECT_SORT_OPTIONS = [
  { value: "updated_desc", label: "По обновлению (новые сверху)" },
  { value: "updated_asc", label: "По обновлению (старые сверху)" },
  { value: "created_desc", label: "По созданию (новые сверху)" },
  { value: "created_asc", label: "По созданию (старые сверху)" },
  { value: "title_asc", label: "Название А → Я" },
] as const;

const PROJECT_STATUS_FILTERS: Array<{ value: "all" | ProjectStatus; label: string }> = [
  { value: "all", label: "Все статусы" },
  ...(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => ({
    value: s,
    label: PROJECT_STATUS_LABEL[s],
  })),
];

const PROJECT_BALL_FILTERS: Array<{ value: "all" | ProjectBall; label: string }> = [
  { value: "all", label: "Все (мяч)" },
  ...(Object.keys(PROJECT_BALL_LABEL) as ProjectBall[]).map((b) => ({
    value: b,
    label: PROJECT_BALL_LABEL[b],
  })),
];

function buildProjectsListQuery(args: {
  tab: "active" | "archive";
  sort: string;
  q: string;
  status: string;
  ball: string;
}): string {
  const p = new URLSearchParams();
  if (args.tab === "archive") p.set("archive", "1");
  if (args.sort && args.sort !== "updated_desc") p.set("sort", args.sort);
  const q = args.q.trim();
  if (q) p.set("q", q);
  if (args.status !== "all") p.set("status", args.status);
  if (args.ball !== "all") p.set("ball", args.ball);
  return p.toString();
}

function buildProjectsPageQuery(args: {
  tab: "active" | "archive";
  sort: string;
  q: string;
  status: string;
  ball: string;
}): string {
  const p = new URLSearchParams();
  if (args.tab === "archive") p.set("tab", "archive");
  if (args.sort && args.sort !== "updated_desc") p.set("sort", args.sort);
  const q = args.q.trim();
  if (q) p.set("q", q);
  if (args.status !== "all") p.set("status", args.status);
  if (args.ball !== "all") p.set("ball", args.ball);
  return p.toString();
}

type CustomerOpt = { id: string; name: string };

function tabFromSearchParams(sp: { get: (k: string) => string | null }): "active" | "archive" {
  const t = sp.get("tab");
  if (t === "archive" || sp.get("archive") === "1") return "archive";
  return "active";
}

function parseStatusFilter(raw: string | null): "all" | ProjectStatus {
  if (!raw || raw === "all") return "all";
  if (raw in PROJECT_STATUS_LABEL) return raw as ProjectStatus;
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
  const [statusFilter, setStatusFilter] = React.useState<"all" | ProjectStatus>(() =>
    parseStatusFilter(searchParams.get("status")),
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
    setStatusFilter(parseStatusFilter(searchParams.get("status")));
    setBallFilter(parseBallFilter(searchParams.get("ball")));
  }, [searchParams]);

  const [projects, setProjects] = React.useState<ProjectCard[]>([]);
  const [listError, setListError] = React.useState<string | null>(null);
  const [customers, setCustomers] = React.useState<CustomerOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createBusy, setCreateBusy] = React.useState(false);
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
      status: statusFilter,
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
  }, [state.status, role, tab, sort, qDebounced, statusFilter, ballFilter]);

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    const pageQs = buildProjectsPageQuery({
      tab,
      sort,
      q: qDebounced,
      status: statusFilter,
      ball: ballFilter,
    });
    router.replace(pageQs ? `${pathname}?${pageQs}` : pathname, { scroll: false });
  }, [state.status, role, tab, sort, qDebounced, statusFilter, ballFilter, pathname, router]);

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
        router.push(`/projects/${data.project.id}`);
        return;
      }
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <AppShell title="Проекты">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-600">
              {tab === "active"
                ? "Активные проекты. До 500 записей с учётом фильтров."
                : "Архив: только просмотр. До 500 записей с учётом фильтров."}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTab("active");
                  setSort("updated_desc");
                }}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  tab === "active"
                    ? "bg-violet-700 text-white"
                    : "border border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50",
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
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  tab === "archive"
                    ? "bg-violet-700 text-white"
                    : "border border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50",
                ].join(" ")}
              >
                Архив
              </button>
            </div>
          </div>

          {tab === "active" ? (
            <form
              onSubmit={createProject}
              className="rounded-2xl border border-violet-200/80 bg-violet-50/40 p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-zinc-900">Управление проектами</div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs text-zinc-600">
                  Название
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                    maxLength={300}
                    required
                  />
                </label>
                <div className="block text-xs text-zinc-600">
                  <div>Заказчик</div>
                  <div className="relative mt-1" ref={customerInputRef}>
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
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50"
                      placeholder="Выберите из списка или введите название заказчика"
                      autoComplete="off"
                      required
                    />
                    {customerDropdownOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-56 overflow-y-auto rounded-2xl border border-zinc-200 bg-white/95 py-1 shadow-[0_10px_40px_rgba(17,24,39,0.12)] backdrop-blur">
                        {customerFiltered.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-zinc-500">
                            {customerInputTrim ? "Нет совпадений - будет создан новый заказчик" : "Нет заказчиков в списке"}
                          </div>
                        ) : (
                          customerFiltered.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="block w-full px-4 py-2 text-left text-sm text-zinc-800 transition hover:bg-violet-50"
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
                  {customerInputTrim && !matchedCustomer ? (
                    <div className="mt-2 border-t border-zinc-200/70 pt-2 text-[11px] text-zinc-500">
                      Будет создан новый заказчик «{customerInputTrim}»
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="submit"
                disabled={createBusy || !title.trim() || !customerInputTrim}
                className="rounded-lg border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {createBusy ? "Создание…" : "Создать"}
              </button>
            </form>
          ) : null}

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-xs font-semibold text-zinc-500">Поиск</span>
                <input
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Название, заказчик, ответственный, id…"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex min-w-[220px] flex-col gap-1">
                <span className="text-xs font-semibold text-zinc-500">Сортировка</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {PROJECT_SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[200px] flex-col gap-1">
                <span className="text-xs font-semibold text-zinc-500">Статус</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(parseStatusFilter(e.target.value))}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {PROJECT_STATUS_FILTERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[160px] flex-col gap-1">
                <span className="text-xs font-semibold text-zinc-500">Мяч</span>
                <select
                  value={ballFilter}
                  onChange={(e) => setBallFilter(parseBallFilter(e.target.value))}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {PROJECT_BALL_FILTERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

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

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : !listError && projects.length === 0 ? (
            <div className="text-sm text-zinc-600">Пока нет проектов.</div>
          ) : !listError ? (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="block rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm transition hover:border-violet-300 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="font-semibold text-zinc-900">{p.title}</div>
                      <div className="text-xs text-zinc-500">обновл. {fmtDate(p.updatedAt)}</div>
                    </div>
                    <div className="mt-1 text-sm text-zinc-600">{p.customer.name}</div>
                    {tab === "archive" && p.archiveNote?.trim() ? (
                      <p className="mt-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700 whitespace-pre-wrap">
                        {p.archiveNote.trim()}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-medium text-zinc-700">
                        {PROJECT_STATUS_LABEL[p.status]}
                      </span>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-900">
                        Мяч: {PROJECT_BALL_LABEL[p.ball]}
                      </span>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-medium text-violet-800">
                        Заявок: {p._count.orders}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-zinc-600">
                        {p.owner.displayName}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function ProjectsPageFallback() {
  return (
    <AppShell title="Проекты">
      <div className="text-sm text-zinc-600">Загрузка…</div>
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
