"use client";

import Link from "next/link";
import * as React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import { readJsonSafe } from "@/lib/fetchJson";
import "./quality.css";

type QualityData = {
  summary: {
    averageRating: number | null;
    responseCount: number;
    eligibleOrders: number;
    responseRate: number;
    lowRatings: number;
    skipped: number;
    distribution: Array<{ rating: number; count: number }>;
  };
  feedback: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
    author: { id: string; displayName: string; login: string };
    order: { id: string; eventName: string | null; closedAt: string | null; customer: { name: string } };
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type ApiError = { error?: { message?: string } };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Omsk",
  }).format(new Date(value));
}

function ReadonlyStars({ rating }: { rating: number }) {
  return <span className="quality-stars" aria-label={`Оценка ${rating} из 5`}>{"★".repeat(rating)}<i>{"★".repeat(5 - rating)}</i></span>;
}

export default function AdminQualityPage() {
  const [data, setData] = React.useState<QualityData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rating, setRating] = React.useState("all");
  const [sort, setSort] = React.useState("newest");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(timeout);
  }, [search]);

  React.useEffect(() => setPage(1), [rating, sort, debouncedSearch]);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: "20", sort });
    if (rating !== "all") params.set("rating", rating);
    if (debouncedSearch) params.set("q", debouncedSearch);
    setLoading(true);
    setError(null);
    void fetch(`/api/admin/quality?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await readJsonSafe<QualityData | ApiError>(response);
        if (!response.ok || !payload || !("summary" in payload)) {
          throw new Error((payload as ApiError | null)?.error?.message ?? "Не удалось загрузить оценки");
        }
        setData(payload);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Не удалось загрузить оценки");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, rating, sort, debouncedSearch]);

  const maxDistribution = Math.max(1, ...(data?.summary.distribution.map((entry) => entry.count) ?? [1]));

  return (
    <AppShell title="Качество сервиса">
      <div className="quality-page">
        <section className="quality-overview">
          <div className="quality-overview__intro">
            <span>Обратная связь Grinvich</span>
            <h2>Как оценивают работу Wowstorg</h2>
            <p>Оценки появляются после закрытия заявки. Низкие баллы собраны отдельно, чтобы команда могла быстро разобрать причину.</p>
          </div>
          <div className="quality-average">
            <span>Средняя оценка</span>
            <strong>{data?.summary.averageRating?.toFixed(2) ?? "—"}<small>/ 5</small></strong>
            <em>{data?.summary.responseCount ?? 0} ответов · {data?.summary.responseRate ?? 0}% закрытых заявок</em>
          </div>
          <div className="quality-distribution" aria-label="Распределение оценок">
            {(data?.summary.distribution ?? [5,4,3,2,1].map((value) => ({ rating: value, count: 0 }))).map((entry) => (
              <div key={entry.rating}>
                <span>{entry.rating} ★</span>
                <i><b style={{ width: `${(entry.count / maxDistribution) * 100}%` }} /></i>
                <strong>{entry.count}</strong>
              </div>
            ))}
          </div>
        </section>

        <div className="quality-facts">
          <div><span>Можно было оценить</span><strong>{data?.summary.eligibleOrders ?? "—"}</strong></div>
          <div><span>Требуют внимания</span><strong>{data?.summary.lowRatings ?? "—"}</strong><small>1–3 звезды</small></div>
          <div><span>Отложили оценку</span><strong>{data?.summary.skipped ?? "—"}</strong><small>можно оставить позже</small></div>
        </div>

        <section className="quality-journal">
          <header>
            <div><h2>Журнал оценок</h2><p>{data?.pagination.total ?? 0} записей по текущему фильтру</p></div>
            <div className="quality-filters">
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Сотрудник, заказчик или заявка" />
              <select value={rating} onChange={(event) => setRating(event.target.value)} aria-label="Фильтр по оценке">
                <option value="all">Все оценки</option>
                {[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} из 5</option>)}
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка оценок">
                <option value="newest">Сначала новые</option>
                <option value="oldest">Сначала старые</option>
                <option value="rating_desc">Сначала высокие</option>
                <option value="rating_asc">Сначала низкие</option>
              </select>
            </div>
          </header>

          {loading && !data ? <ListSkeleton rows={6} /> : null}
          {error ? <div className="quality-error" role="alert">{error}</div> : null}
          {!loading && !error && data?.feedback.length === 0 ? (
            <div className="quality-empty"><strong>Оценок по этому фильтру нет</strong><span>Попробуйте снять фильтр или изменить поиск.</span></div>
          ) : null}

          <div className="quality-list" aria-busy={loading}>
            {data?.feedback.map((entry) => (
              <article key={entry.id} className={entry.rating <= 3 ? "needs-attention" : undefined}>
                <div className="quality-list__rating"><ReadonlyStars rating={entry.rating} /><time dateTime={entry.updatedAt}>{formatDate(entry.updatedAt)}</time></div>
                <div className="quality-list__body">
                  <div><strong>{entry.order.eventName || entry.order.customer.name}</strong><span>{entry.order.customer.name}</span></div>
                  <p>{entry.comment || "Без комментария"}</p>
                </div>
                <div className="quality-list__author"><strong>{entry.author.displayName}</strong><span>@{entry.author.login}</span><Link href={`/orders/${entry.order.id}?from=admin-quality`}>Открыть заявку →</Link></div>
              </article>
            ))}
          </div>

          {data && data.pagination.totalPages > 1 ? (
            <footer className="quality-pagination">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Новее</button>
              <span>{page} из {data.pagination.totalPages}</span>
              <button type="button" disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Раньше →</button>
            </footer>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
