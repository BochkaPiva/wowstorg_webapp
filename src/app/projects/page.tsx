"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense } from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { PROJECT_BALL_LABEL, PROJECT_STATUS_LABEL } from "@/lib/project-ui-labels";
import { useAuth } from "@/app/providers";

type ProjectCard = {
  id: string;
  title: string;
  status: keyof typeof PROJECT_STATUS_LABEL;
  ball: keyof typeof PROJECT_BALL_LABEL;
  archivedAt: string | null;
  updatedAt: string;
  createdAt: string;
  customer: { id: string; name: string };
  owner: { id: string; displayName: string };
  _count: { orders: number };
};

type CustomerOpt = { id: string; name: string };

function tabFromSearchParams(sp: { get: (k: string) => string | null }): "active" | "archive" {
  const t = sp.get("tab");
  if (t === "archive" || sp.get("archive") === "1") return "archive";
  return "active";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ProjectsContent() {
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const role = state.status === "authenticated" ? state.user.role : null;
  const forbidden = state.status === "authenticated" && role !== "WOWSTORG";

  const [tab, setTab] = React.useState<"active" | "archive">(() => tabFromSearchParams(searchParams));

  React.useEffect(() => {
    setTab(tabFromSearchParams(searchParams));
  }, [searchParams]);
  const [projects, setProjects] = React.useState<ProjectCard[]>([]);
  const [customers, setCustomers] = React.useState<CustomerOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createBusy, setCreateBusy] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");

  const loadProjects = React.useCallback(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    const qs = tab === "archive" ? "?archive=1" : "";
    setLoading(true);
    fetch(`/api/projects${qs}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { projects?: ProjectCard[] } | null) => {
        setProjects(data?.projects ?? []);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [state.status, role, tab]);

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    fetch("/api/customers?all=true", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { customers?: CustomerOpt[] } | null) => {
        setCustomers(data?.customers ?? []);
      })
      .catch(() => setCustomers([]));
  }, [state.status, role]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !customerId) return;
    setCreateBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), customerId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.project?.id) {
        setTitle("");
        setCustomerId("");
        window.location.href = `/projects/${data.project.id}`;
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
          <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
            <button
              type="button"
              onClick={() => setTab("active")}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                tab === "active"
                  ? "bg-violet-700 text-white"
                  : "border border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50",
              ].join(" ")}
            >
              Активные
            </button>
            <button
              type="button"
              onClick={() => setTab("archive")}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                tab === "archive"
                  ? "bg-violet-700 text-white"
                  : "border border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50",
              ].join(" ")}
            >
              Архив
            </button>
          </div>

          {tab === "active" ? (
            <form
              onSubmit={createProject}
              className="rounded-2xl border border-violet-200/80 bg-violet-50/40 p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-zinc-900">Новый проект</div>
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
                <label className="block text-xs text-zinc-600">
                  Заказчик
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                    required
                  >
                    <option value="">Выберите…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="submit"
                disabled={createBusy}
                className="rounded-lg border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {createBusy ? "Создание…" : "Создать"}
              </button>
            </form>
          ) : null}

          <div className="text-sm text-zinc-600">
            {tab === "active"
              ? "Проекты без архивной отметки. До 500 записей."
              : "Архив: полные данные, в карточке — только просмотр."}
          </div>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : projects.length === 0 ? (
            <div className="text-sm text-zinc-600">Пока нет проектов.</div>
          ) : (
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
          )}
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
