"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { ToggleSwitch } from "@/app/_ui/ToggleSwitch";
import { PositionRelatedItemsEditor } from "@/app/inventory/positions/PositionRelatedItemsEditor";
import { useAuth } from "@/app/providers";

import "../position-edit.css";

type ItemType = "ASSET" | "BULK" | "CONSUMABLE";
type Category = { id: string; name: string; slug: string };

type Item = {
  id: string;
  name: string;
  description: string | null;
  type: ItemType;
  isActive: boolean;
  internalOnly: boolean;
  pricePerDay: string;
  purchasePricePerUnit: string | null;
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
  photo1Key: string | null;
  categories: { categoryId: string }[];
  collections: { collectionId: string; position: number }[];
  updatedAt: string;
};

const TYPE_OPTIONS: Array<{ value: ItemType; label: string }> = [
  { value: "ASSET", label: "Штучный" },
  { value: "BULK", label: "Мерный" },
  { value: "CONSUMABLE", label: "Расходник" },
];

function computeAvailableNow(p: Pick<Item, "total" | "inRepair" | "broken" | "missing">) {
  return Math.max(0, p.total - p.inRepair - p.broken - p.missing);
}

function parseStockField(raw: string): number {
  const n = Math.trunc(Number(raw) || 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function PositionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const { id } = React.use(params);
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);

  const [item, setItem] = React.useState<Item | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: "",
    description: "",
    type: "ASSET" as ItemType,
    pricePerDay: "",
    purchasePricePerUnit: "",
    total: "0",
    inRepair: "0",
    broken: "0",
    missing: "0",
    internalOnly: false,
    isActive: true,
    categoryIds: [] as string[],
  });

  const previewAvailable = React.useMemo(
    () =>
      computeAvailableNow({
        total: parseStockField(form.total),
        inRepair: parseStockField(form.inRepair),
        broken: parseStockField(form.broken),
        missing: parseStockField(form.missing),
      }),
    [form.total, form.inRepair, form.broken, form.missing],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}`, { cache: "no-store" });
      const txt = await res.text();
      const data = txt
        ? (JSON.parse(txt) as { item?: Item; categories?: Category[]; error?: { message?: string } })
        : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить позицию");
      if (!data.item) throw new Error("Позиция не найдена");
      const it = data.item;
      setItem(it);
      setCategories(data.categories ?? []);
      setForm({
        name: it.name,
        description: it.description ?? "",
        type: it.type,
        pricePerDay: String(it.pricePerDay ?? ""),
        purchasePricePerUnit: it.purchasePricePerUnit != null ? String(it.purchasePricePerUnit) : "",
        total: String(it.total),
        inRepair: String(it.inRepair),
        broken: String(it.broken),
        missing: String(it.missing),
        internalOnly: it.internalOnly,
        isActive: it.isActive,
        categoryIds: it.categories.map((c) => c.categoryId),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (forbidden) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbidden, id]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const price = Number(form.pricePerDay);
      const purchasePrice = Number(form.purchasePricePerUnit);
      const total = parseStockField(form.total);
      const inRepair = parseStockField(form.inRepair);
      const broken = parseStockField(form.broken);
      const missing = parseStockField(form.missing);

      const res = await fetch(`/api/inventory/positions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description.trim() ? form.description.trim() : null,
          type: form.type,
          pricePerDay: Number.isFinite(price) ? price : 0,
          purchasePricePerUnit:
            form.purchasePricePerUnit.trim() === ""
              ? null
              : Number.isFinite(purchasePrice)
                ? purchasePrice
                : 0,
          total,
          inRepair,
          broken,
          missing,
          internalOnly: form.internalOnly,
          isActive: form.isActive,
          categoryIds: form.categoryIds,
          collectionIds: [],
        }),
      });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось сохранить");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/inventory/positions/${id}/photo`, { method: "POST", body: fd });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить фото");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto() {
    if (!confirm("Удалить фото?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}/photo`, { method: "DELETE" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось удалить фото");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить позицию? Это действие необратимо.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text();
        const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
        throw new Error(data?.error?.message ?? "Не удалось удалить");
      }
      window.location.href = "/inventory/positions";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function toggleCategory(categoryId: string) {
    setForm((s) => ({
      ...s,
      categoryIds: s.categoryIds.includes(categoryId)
        ? s.categoryIds.filter((cid) => cid !== categoryId)
        : [...s.categoryIds, categoryId],
    }));
  }

  if (forbidden) {
    return (
      <AppShell title="Инвентарь · Позиция">
        <div className="pos-edit-muted">Этот раздел доступен только Wowstorg (склад).</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Инвентарь · Позиция">
      <div className="pos-edit">
        <div className="pos-edit-toolbar">
          <Link href="/inventory/positions" className="pos-edit-back">
            ← К позициям
          </Link>
          <div className="pos-edit-actions">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || loading || !form.name.trim()}
              className="pos-edit-btn pos-edit-btn--primary"
            >
              {busy ? "Сохраняю…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy || loading}
              className="pos-edit-btn pos-edit-btn--danger"
            >
              Удалить
            </button>
          </div>
        </div>

        {loading ? (
          <div className="pos-edit-muted">Загрузка…</div>
        ) : error && !item ? (
          <div className="pos-edit-alert pos-edit-alert--error">{error}</div>
        ) : item ? (
          <>
            {error ? <div className="pos-edit-alert pos-edit-alert--error">{error}</div> : null}

            <section className="pos-edit-hero">
              <h1 className="pos-edit-hero-title">{form.name.trim() || item.name}</h1>
              <div className="pos-edit-hero-meta">
                <span className="pos-edit-stat">
                  доступно <strong>{previewAvailable}</strong> из {parseStockField(form.total)}
                </span>
                <span
                  className={[
                    "pos-edit-badge",
                    form.isActive ? "pos-edit-badge--ok" : "pos-edit-badge--muted",
                  ].join(" ")}
                >
                  {form.isActive ? "Активна" : "Неактивна"}
                </span>
                {form.internalOnly ? (
                  <span className="pos-edit-badge pos-edit-badge--warn">Только склад</span>
                ) : (
                  <span className="pos-edit-badge pos-edit-badge--violet">В каталоге</span>
                )}
                <span className="pos-edit-badge pos-edit-badge--muted">
                  {TYPE_OPTIONS.find((t) => t.value === form.type)?.label ?? form.type}
                </span>
                <span>Обновлено: {new Date(item.updatedAt).toLocaleString("ru-RU")}</span>
              </div>
            </section>

            <div className="pos-edit-grid">
              <div className="pos-edit-stack">
                <section className="pos-edit-card">
                  <h2 className="pos-edit-card-title">Основное</h2>
                  <p className="pos-edit-card-hint">Название, описание и тариф — то, что видит Greenwich в каталоге.</p>
                  <div className="pos-edit-fields pos-edit-fields--2">
                    <div className="pos-edit-field pos-edit-field--full">
                      <label className="pos-edit-label" htmlFor="pos-name">
                        Название
                      </label>
                      <input
                        id="pos-name"
                        value={form.name}
                        onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                        className="pos-edit-input"
                      />
                    </div>
                    <div className="pos-edit-field pos-edit-field--full">
                      <label className="pos-edit-label" htmlFor="pos-description">
                        Описание
                      </label>
                      <textarea
                        id="pos-description"
                        value={form.description}
                        onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                        className="pos-edit-textarea"
                      />
                    </div>
                    <div className="pos-edit-field pos-edit-field--full">
                      <span className="pos-edit-label">Тип позиции</span>
                      <div className="pos-edit-segment" role="group" aria-label="Тип позиции">
                        {TYPE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={[
                              "pos-edit-segment-btn",
                              form.type === opt.value ? "pos-edit-segment-btn--active" : "",
                            ].join(" ")}
                            onClick={() => setForm((s) => ({ ...s, type: opt.value }))}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pos-edit-field">
                      <label className="pos-edit-label" htmlFor="pos-price">
                        Цена / сутки (₽)
                      </label>
                      <input
                        id="pos-price"
                        value={form.pricePerDay}
                        onChange={(e) => setForm((s) => ({ ...s, pricePerDay: e.target.value }))}
                        className="pos-edit-input"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="pos-edit-field">
                      <label className="pos-edit-label" htmlFor="pos-purchase">
                        Закуп за единицу (₽)
                      </label>
                      <input
                        id="pos-purchase"
                        value={form.purchasePricePerUnit}
                        onChange={(e) => setForm((s) => ({ ...s, purchasePricePerUnit: e.target.value }))}
                        className="pos-edit-input"
                        inputMode="decimal"
                        placeholder="Необязательно"
                      />
                    </div>
                  </div>
                </section>

                <section className="pos-edit-card">
                  <h2 className="pos-edit-card-title">Склад и остатки</h2>
                  <p className="pos-edit-card-hint">Общее количество и позиции вне выдачи.</p>
                  <div className="pos-edit-fields">
                    <div className="pos-edit-stock-grid">
                      <div className="pos-edit-field">
                        <label className="pos-edit-label" htmlFor="pos-total">
                          Всего
                        </label>
                        <input
                          id="pos-total"
                          value={form.total}
                          onChange={(e) => setForm((s) => ({ ...s, total: e.target.value }))}
                          className="pos-edit-input"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="pos-edit-field">
                        <label className="pos-edit-label" htmlFor="pos-repair">
                          В ремонте
                        </label>
                        <input
                          id="pos-repair"
                          value={form.inRepair}
                          onChange={(e) => setForm((s) => ({ ...s, inRepair: e.target.value }))}
                          className="pos-edit-input"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="pos-edit-field">
                        <label className="pos-edit-label" htmlFor="pos-broken">
                          Сломано
                        </label>
                        <input
                          id="pos-broken"
                          value={form.broken}
                          onChange={(e) => setForm((s) => ({ ...s, broken: e.target.value }))}
                          className="pos-edit-input"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="pos-edit-field">
                        <label className="pos-edit-label" htmlFor="pos-missing">
                          Утеряно
                        </label>
                        <input
                          id="pos-missing"
                          value={form.missing}
                          onChange={(e) => setForm((s) => ({ ...s, missing: e.target.value }))}
                          className="pos-edit-input"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <div className="pos-edit-stock-summary">
                      К выдаче сейчас: <strong>{previewAvailable}</strong> шт. (всего − ремонт − сломано − утеряно)
                    </div>
                  </div>
                </section>

                <section className="pos-edit-card">
                  <h2 className="pos-edit-card-title">Категории каталога</h2>
                  <p className="pos-edit-card-hint">Нажмите на категорию, чтобы включить или выключить.</p>
                  {categories.length === 0 ? (
                    <p className="pos-edit-muted" style={{ marginTop: "0.85rem" }}>
                      Категории пока не созданы.
                    </p>
                  ) : (
                    <div className="pos-edit-chips">
                      {categories.map((c) => {
                        const selected = form.categoryIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={["pos-edit-chip", selected ? "pos-edit-chip--on" : ""].join(" ")}
                            aria-pressed={selected}
                            onClick={() => toggleCategory(c.id)}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <div className="pos-edit-stack">
                <section className="pos-edit-card">
                  <h2 className="pos-edit-card-title">Фото</h2>
                  <p className="pos-edit-card-hint">JPG, PNG, WebP или GIF — до 5 MB.</p>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadPhoto(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="pos-edit-photo-drop">
                    <div className="pos-edit-photo-row">
                      <div className="pos-edit-photo-preview">
                        {item.photo1Key ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/inventory/positions/${id}/photo`} alt="" />
                        ) : (
                          <span>Фото не загружено</span>
                        )}
                      </div>
                      <div className="pos-edit-photo-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => photoInputRef.current?.click()}
                          className="pos-edit-btn pos-edit-btn--primary"
                        >
                          {item.photo1Key ? "Заменить фото" : "Загрузить фото"}
                        </button>
                        {item.photo1Key ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deletePhoto()}
                            className="pos-edit-btn pos-edit-btn--ghost"
                          >
                            Удалить
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="pos-edit-card">
                  <h2 className="pos-edit-card-title">Видимость</h2>
                  <p className="pos-edit-card-hint">Управление доступностью позиции в каталоге и для клиентов.</p>
                  <div style={{ marginTop: "0.85rem" }}>
                    <div className="pos-edit-toggle-row">
                      <ToggleSwitch
                        checked={form.isActive}
                        onChange={(next) => setForm((s) => ({ ...s, isActive: next }))}
                        label="Позиция активна"
                        description="Неактивные позиции скрыты из каталога и недоступны для новых заявок."
                      />
                    </div>
                    <div className="pos-edit-toggle-row">
                      <ToggleSwitch
                        checked={form.internalOnly}
                        onChange={(next) => setForm((s) => ({ ...s, internalOnly: next }))}
                        label="Только для склада"
                        description="Не показывать в каталоге Greenwich — только внутренний реквизит Wowstorg."
                      />
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <PositionRelatedItemsEditor positionId={id} />
            </div>
          </>
        ) : (
          <div className="pos-edit-muted">Позиция не найдена.</div>
        )}
      </div>
    </AppShell>
  );
}
