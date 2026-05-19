"use client";

import React from "react";

import { MAX_ITEM_RELATIONS_PER_SOURCE } from "@/lib/item-related-constants";

import "./position-edit.css";

type RelationKind = "REQUIRED" | "RECOMMENDED";

type SearchItem = { id: string; name: string; isActive: boolean; internalOnly: boolean };

type DraftRow = {
  key: string;
  relatedItemId: string;
  relatedName: string;
  isActive: boolean;
  internalOnly: boolean;
  kind: RelationKind;
  sortOrder: number;
  defaultSuggestedQty: number;
  note: string;
};

function newKey() {
  return `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PositionRelatedItemsEditor({ positionId }: { positionId: string }) {
  const [rows, setRows] = React.useState<DraftRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [searchItems, setSearchItems] = React.useState<SearchItem[]>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);

  const existingRelatedIds = React.useMemo(
    () => new Set([positionId, ...rows.map((r) => r.relatedItemId)]),
    [positionId, rows],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${positionId}/related`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as {
        relations?: Array<{
          relatedItemId: string;
          kind: RelationKind;
          sortOrder: number;
          defaultSuggestedQty: number;
          note: string | null;
          relatedItem: { name: string; isActive: boolean; internalOnly: boolean };
        }>;
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить связи");
      setRows(
        (data?.relations ?? []).map((r) => ({
          key: newKey(),
          relatedItemId: r.relatedItemId,
          relatedName: r.relatedItem.name,
          isActive: r.relatedItem.isActive,
          internalOnly: r.relatedItem.internalOnly,
          kind: r.kind,
          sortOrder: r.sortOrder,
          defaultSuggestedQty: r.defaultSuggestedQty,
          note: r.note ?? "",
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [positionId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchItems([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("query", q);
        const res = await fetch(`/api/inventory/positions?${params.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as {
          items?: Array<{ id: string; name: string; isActive: boolean; internalOnly: boolean }>;
          error?: { message?: string };
        } | null;
        if (!cancelled) {
          if (!res.ok) {
            setSearchItems([]);
            setError(data?.error?.message ?? "Не удалось выполнить поиск");
            return;
          }
          setSearchItems(
            (data?.items ?? [])
              .filter((i) => !existingRelatedIds.has(i.id))
              .map((i) => ({
                id: i.id,
                name: i.name,
                isActive: i.isActive,
                internalOnly: i.internalOnly,
              })),
          );
        }
      } catch {
        if (!cancelled) setSearchItems([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, existingRelatedIds]);

  function addRelation(item: SearchItem) {
    if (rows.some((r) => r.relatedItemId === item.id)) {
      setError("Эта позиция уже в списке связей");
      return;
    }
    if (rows.length >= MAX_ITEM_RELATIONS_PER_SOURCE) {
      setError(`Не более ${MAX_ITEM_RELATIONS_PER_SOURCE} связей`);
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        relatedItemId: item.id,
        relatedName: item.name,
        isActive: item.isActive,
        internalOnly: item.internalOnly,
        kind: "RECOMMENDED",
        sortOrder: prev.length,
        defaultSuggestedQty: 1,
        note: "",
      },
    ]);
    setQuery("");
    setSearchOpen(false);
    setSaved(false);
    setError(null);
  }

  function moveRow(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next.map((r, i) => ({ ...r, sortOrder: i }));
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/inventory/positions/${positionId}/related`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relations: rows.map((r, index) => ({
            relatedItemId: r.relatedItemId,
            kind: r.kind,
            sortOrder: index,
            defaultSuggestedQty: Math.max(1, Math.trunc(r.defaultSuggestedQty) || 1),
            note: r.note.trim() ? r.note.trim() : null,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось сохранить");
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pos-edit-card">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <h2 className="pos-edit-card-title">Связанные позиции</h2>
          <p className="pos-edit-card-hint">
            Рекомендации в корзине: если взяли эту позицию — предложить связанные. Направление только от
            этой позиции к другим.
          </p>
        </div>
        <div className="pos-edit-muted tabular-nums" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
          {rows.length} / {MAX_ITEM_RELATIONS_PER_SOURCE}
        </div>
      </div>

      {error ? <div className="pos-edit-alert pos-edit-alert--error" style={{ marginTop: "0.85rem" }}>{error}</div> : null}
      {saved ? (
        <div
          className="pos-edit-alert"
          style={{
            marginTop: "0.85rem",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            background: "#ecfdf5",
            color: "#047857",
          }}
        >
          Связи сохранены
        </div>
      ) : null}

      <div className="pos-edit-related-search" style={{ marginTop: "1rem" }}>
        <label className="pos-edit-label" htmlFor="pos-related-search">
          Добавить связь
        </label>
        <input
          id="pos-related-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Поиск позиции по названию…"
          className="pos-edit-input"
          style={{ marginTop: "0.35rem" }}
        />
        {searchOpen && query.trim().length >= 2 ? (
          <div className="pos-edit-related-dropdown">
            {searching ? (
              <div className="pos-edit-related-option pos-edit-muted">Поиск…</div>
            ) : searchItems.length > 0 ? (
              searchItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="pos-edit-related-option"
                  onClick={() => addRelation(item)}
                >
                  {item.name}
                  {!item.isActive ? (
                    <span className="pos-edit-badge pos-edit-badge--warn" style={{ marginLeft: "0.45rem" }}>
                      неактивна
                    </span>
                  ) : null}
                  {item.internalOnly ? (
                    <span className="pos-edit-badge pos-edit-badge--muted" style={{ marginLeft: "0.35rem" }}>
                      внутр.
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="pos-edit-related-option pos-edit-muted">Ничего не найдено</div>
            )}
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="pos-edit-muted" style={{ marginTop: "1rem" }}>
          Загрузка связей…
        </p>
      ) : rows.length === 0 ? (
        <p className="pos-edit-muted" style={{ marginTop: "1rem" }}>
          Связей пока нет.
        </p>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          {rows.map((row, index) => (
            <div key={row.key} className="pos-edit-related-row">
              <div className="pos-edit-related-row-head">
                <div>
                  <div className="pos-edit-related-row-name">{row.relatedName}</div>
                  <div style={{ marginTop: "0.35rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {!row.isActive ? (
                      <span className="pos-edit-badge pos-edit-badge--warn">неактивна</span>
                    ) : null}
                    {row.internalOnly ? (
                      <span className="pos-edit-badge pos-edit-badge--muted">только склад</span>
                    ) : null}
                  </div>
                </div>
                <div className="pos-edit-related-row-actions">
                  <button
                    type="button"
                    className="pos-edit-icon-btn"
                    onClick={() => moveRow(index, -1)}
                    disabled={index === 0}
                    aria-label="Выше"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="pos-edit-icon-btn"
                    onClick={() => moveRow(index, 1)}
                    disabled={index === rows.length - 1}
                    aria-label="Ниже"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="pos-edit-icon-btn pos-edit-icon-btn--danger"
                    onClick={() => {
                      setRows((prev) => prev.filter((r) => r.key !== row.key));
                      setSaved(false);
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div className="pos-edit-fields pos-edit-fields--2" style={{ marginTop: "0.75rem" }}>
                <div className="pos-edit-field">
                  <span className="pos-edit-label">Тип рекомендации</span>
                  <div className="pos-edit-segment" role="group" aria-label="Тип рекомендации">
                    <button
                      type="button"
                      className={[
                        "pos-edit-segment-btn",
                        row.kind === "REQUIRED" ? "pos-edit-segment-btn--active" : "",
                      ].join(" ")}
                      onClick={() => {
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, kind: "REQUIRED" } : r)),
                        );
                        setSaved(false);
                      }}
                    >
                      Обычно нужно
                    </button>
                    <button
                      type="button"
                      className={[
                        "pos-edit-segment-btn",
                        row.kind === "RECOMMENDED" ? "pos-edit-segment-btn--active" : "",
                      ].join(" ")}
                      onClick={() => {
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, kind: "RECOMMENDED" } : r)),
                        );
                        setSaved(false);
                      }}
                    >
                      Может пригодиться
                    </button>
                  </div>
                </div>
                <div className="pos-edit-field">
                  <label className="pos-edit-label" htmlFor={`rel-qty-${row.key}`}>
                    Кол-во в рекомендации
                  </label>
                  <input
                    id={`rel-qty-${row.key}`}
                    type="number"
                    min={1}
                    value={row.defaultSuggestedQty}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      setRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key
                            ? { ...r, defaultSuggestedQty: Number.isFinite(n) && n > 0 ? n : 1 }
                            : r,
                        ),
                      );
                      setSaved(false);
                    }}
                    className="pos-edit-input"
                  />
                </div>
                <div className="pos-edit-field pos-edit-field--full">
                  <label className="pos-edit-label" htmlFor={`rel-note-${row.key}`}>
                    Подпись (необяз.)
                  </label>
                  <input
                    id={`rel-note-${row.key}`}
                    value={row.note}
                    onChange={(e) => {
                      const note = e.target.value;
                      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, note } : r)));
                      setSaved(false);
                    }}
                    placeholder="например: для утяжеления"
                    className="pos-edit-input"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void save()}
          className="pos-edit-btn pos-edit-btn--primary"
        >
          {saving ? "Сохранение…" : "Сохранить связи"}
        </button>
      </div>
    </section>
  );
}
