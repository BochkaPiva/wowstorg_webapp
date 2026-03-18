"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { loadCart, saveCart, clearCart, type CartLine } from "@/lib/cart";
import { PAY_MULTIPLIER_GREENWICH } from "@/lib/constants";
import "./cart.css";
import "../checkout/checkout.css";

type CatalogItem = {
  id: string;
  name: string;
  type: string;
  pricePerDay: string;
  availability: { availableNow: number };
};

function formatDateRu(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function daysBetweenDateOnly(start: string, end: string) {
  const a = new Date(start + "T12:00:00");
  const b = new Date(end + "T12:00:00");
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return 0;
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={["co-toggle", checked ? "co-toggle--on" : ""].join(" ")}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="co-toggleLabel">{label}</span>
      <span className="co-toggleTrack" aria-hidden>
        <span className="co-toggleThumb" />
      </span>
    </button>
  );
}

type Customer = { id: string; name: string };
type GreenwichUser = { id: string; displayName: string };

export default function CartPage() {
  const router = useRouter();
  const { state } = useAuth();

  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [startDate, setStartDate] = React.useState<string | null>(null);
  const [endDate, setEndDate] = React.useState<string | null>(null);
  const [readyByDate, setReadyByDate] = React.useState<string | null>(null);

  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [customerId, setCustomerId] = React.useState("");
  const [eventName, setEventName] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [deliveryEnabled, setDeliveryEnabled] = React.useState(false);
  const [deliveryComment, setDeliveryComment] = React.useState("");
  const [deliveryPrice, setDeliveryPrice] = React.useState("");
  const [montageEnabled, setMontageEnabled] = React.useState(false);
  const [montageComment, setMontageComment] = React.useState("");
  const [montagePrice, setMontagePrice] = React.useState("");
  const [demontageEnabled, setDemontageEnabled] = React.useState(false);
  const [demontageComment, setDemontageComment] = React.useState("");
  const [demontagePrice, setDemontagePrice] = React.useState("");

  const [orderType, setOrderType] = React.useState<"greenwich" | "external">("external");
  const [greenwichUsers, setGreenwichUsers] = React.useState<GreenwichUser[]>([]);
  const [greenwichUserId, setGreenwichUserId] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    setCart(loadCart());
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setStartDate(localStorage.getItem("catalog_startDate"));
    setEndDate(localStorage.getItem("catalog_endDate"));
    setReadyByDate(localStorage.getItem("catalog_readyByDate"));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/customers", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { customers: Customer[] }) => {
        if (!cancelled) {
          setCustomers(data.customers ?? []);
          if (!customerId && data.customers?.[0]?.id) setCustomerId(data.customers[0].id);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (state.status !== "authenticated" || state.user.role !== "WOWSTORG") return;
    let cancelled = false;
    fetch("/api/users/greenwich", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { users: GreenwichUser[] }) => {
        if (!cancelled) setGreenwichUsers(data.users ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [state.status, state.user.role]);

  React.useEffect(() => {
    if (cart.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ids = cart.map((l) => l.itemId).join(",");
    fetch(`/api/catalog/items?ids=${encodeURIComponent(ids)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { items: CatalogItem[] }) => {
        if (!cancelled) {
          setItems(data.items ?? []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cart.length, cart.map((l) => l.itemId).join(",")]);

  function setQty(itemId: string, qty: number) {
    const next = cart
      .map((l) => (l.itemId === itemId ? { ...l, qty } : l))
      .filter((l) => l.qty > 0);
    if (!next.some((l) => l.itemId === itemId) && qty > 0) {
      next.push({ itemId, qty });
    }
    setCart(next);
    saveCart(next);
  }

  function remove(itemId: string) {
    setCart(cart.filter((l) => l.itemId !== itemId));
    saveCart(cart.filter((l) => l.itemId !== itemId));
  }

  const isGreenwich = state.status === "authenticated" && state.user.role === "GREENWICH";
  const isWarehouse = state.status === "authenticated" && state.user.role === "WOWSTORG";

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const lines = cart
    .map((l) => ({ line: l, item: itemMap.get(l.itemId) }))
    .filter((x): x is { line: CartLine; item: CatalogItem } => x.item != null);

  // У склада при выборе «выдача Greenwich» корзина считается со скидкой; для 3-х лиц — полная цена.
  // Greenwich получает из каталога уже цены со скидкой, поэтому multiplier для них не применяем.
  const displayMultiplier =
    isWarehouse && orderType === "greenwich" ? PAY_MULTIPLIER_GREENWICH : 1;

  const totalPerDay = lines.reduce((sum, { line, item }) => {
    const basePrice = Number(item.pricePerDay) || 0;
    const price = basePrice * displayMultiplier;
    return sum + price * line.qty;
  }, 0);
  const rentalDays = startDate && endDate ? daysBetweenDateOnly(startDate, endDate) : 0;
  const totalForPeriod = totalPerDay * (rentalDays || 1);

  const deliveryPriceNum =
    deliveryEnabled && deliveryPrice.trim()
      ? Number(deliveryPrice.replace(",", ".")) || 0
      : 0;
  const montagePriceNum =
    montageEnabled && montagePrice.trim()
      ? Number(montagePrice.replace(",", ".")) || 0
      : 0;
  const demontagePriceNum =
    demontageEnabled && demontagePrice.trim()
      ? Number(demontagePrice.replace(",", ".")) || 0
      : 0;
  const totalWithServices =
    totalForPeriod + deliveryPriceNum + montagePriceNum + demontagePriceNum;

  const canCheckoutGreenwich =
    isGreenwich && cart.length > 0 && Boolean(customerId);
  const canCheckoutWarehouse =
    isWarehouse &&
    cart.length > 0 &&
    Boolean(customerId) &&
    (orderType !== "greenwich" || Boolean(greenwichUserId));
  const canCheckout =
    (canCheckoutGreenwich || canCheckoutWarehouse) && Boolean(startDate && endDate && readyByDate);

  async function submit() {
    if (!startDate || !endDate || !readyByDate) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        customerId,
        readyByDate,
        startDate,
        endDate,
        eventName: eventName.trim() || undefined,
        comment: comment.trim() || undefined,
        deliveryEnabled,
        deliveryComment: deliveryEnabled ? deliveryComment.trim() || undefined : undefined,
        montageEnabled,
        montageComment: montageEnabled ? montageComment.trim() || undefined : undefined,
        demontageEnabled,
        demontageComment: demontageEnabled ? demontageComment.trim() || undefined : undefined,
        lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty })),
      };
      if (isWarehouse) {
        const dp = deliveryPrice.trim() ? Number(deliveryPrice.replace(",", ".")) : undefined;
        const mp = montagePrice.trim() ? Number(montagePrice.replace(",", ".")) : undefined;
        const dmp = demontagePrice.trim() ? Number(demontagePrice.replace(",", ".")) : undefined;
        if (dp != null && !Number.isNaN(dp)) payload.deliveryPrice = dp;
        if (mp != null && !Number.isNaN(mp)) payload.montagePrice = mp;
        if (dmp != null && !Number.isNaN(dmp)) payload.demontagePrice = dmp;
        payload.source = orderType === "greenwich" ? "GREENWICH_INTERNAL" : "WOWSTORG_EXTERNAL";
        if (orderType === "greenwich" && greenwichUserId)
          payload.greenwichUserId = greenwichUserId;
      }
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { orderId?: string; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось создать заявку");
        return;
      }
      clearCart();
      setCart([]);
      router.replace(`/orders/${data?.orderId ?? ""}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Корзина">
      <section className="cart-section">
        <div className="cart-head">
          <h1 className="cart-title">Корзина</h1>
          <p className="cart-subtitle">
            Проверь состав, измени количество или перейди к оформлению заявки.
          </p>
        </div>

        {loading ? (
          <p className="cart-muted">Загрузка…</p>
        ) : lines.length === 0 ? (
          <div className="cart-empty">
            <p className="cart-muted">Корзина пуста.</p>
          </div>
        ) : (
          <>
            {startDate && endDate && rentalDays > 0 ? (
              <p className="cart-muted" style={{ marginBottom: "0.75rem" }}>
                Период: <strong>{formatDateRu(startDate)}</strong> —{" "}
                <strong>{formatDateRu(endDate)}</strong> · {rentalDays} дн.
              </p>
            ) : (
              <p className="cart-muted" style={{ marginBottom: "0.75rem" }}>
                Укажи даты в каталоге, чтобы посчитать итог за период.
              </p>
            )}
            <div className="cart-list-head">
              <button
                type="button"
                className="cart-clearAll"
                onClick={() => {
                  clearCart();
                  setCart([]);
                }}
                aria-label="Очистить корзину"
              >
                Удалить все
              </button>
            </div>
            <ul className="cart-list">
              {lines.map(({ line, item }) => {
                const basePrice = Number(item.pricePerDay) || 0;
                const price = basePrice * displayMultiplier;
                const lineTotalPerDay = price * line.qty;
                const lineTotalForPeriod = lineTotalPerDay * (rentalDays || 0);
                return (
                  <li key={item.id} className="cart-row">
                    <div className="cart-row-main">
                      <span className="cart-name">{item.name}</span>
                      <span className="cart-meta">
                        <strong>{price.toFixed(0)}</strong>{" "}
                        <span className="cart-unit">р/сут</span> × {line.qty}
                        {rentalDays > 0 ? (
                          <>
                            {" "}× {rentalDays} дн. ={" "}
                            <strong>{lineTotalForPeriod.toFixed(0)}</strong>{" "}
                            <span className="cart-unit">р</span>
                          </>
                        ) : (
                          <>
                            {" "}={" "}
                            <strong>{lineTotalPerDay.toFixed(0)}</strong>{" "}
                            <span className="cart-unit">р/сут</span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="cart-row-actions">
                      <div className="cart-qty" aria-label="Количество">
                        <button
                          type="button"
                          onClick={() => setQty(item.id, line.qty - 1)}
                          aria-label="Уменьшить"
                        >
                          −
                        </button>
                        <span>{line.qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item.id, line.qty + 1)}
                          aria-label="Увеличить"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="cart-remove"
                        onClick={() => remove(item.id)}
                        aria-label="Удалить"
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {(isGreenwich || isWarehouse) ? (
              <>
                <div className="co-head" style={{ marginTop: "1.5rem" }}>
                  <div className="co-title">Оформление заявки</div>
                  <div className="co-subtitle">
                    {isWarehouse
                      ? "Даты выбраны в каталоге. Укажи, на кого заявка, заказчика и доп. услуги."
                      : "Даты выбраны в каталоге. Заполни заказчика и при необходимости доп. услуги."}
                  </div>
                </div>

                {readyByDate && startDate && endDate ? (
                  <div className="co-dates">
                    <div className="co-datePill">
                      Готовность: <strong>{formatDateRu(readyByDate)}</strong>
                    </div>
                    <div className="co-datePill">
                      Период: <strong>{formatDateRu(startDate)}</strong> —{" "}
                      <strong>{formatDateRu(endDate)}</strong>
                    </div>
                    <Link href="/catalog" className="co-link">
                      Изменить даты →
                    </Link>
                  </div>
                ) : null}

                {isWarehouse ? (
                  <div className="co-field" style={{ marginBottom: "1rem" }}>
                    <div className="co-label">Тип заявки</div>
                    <div className="co-flipSwitchContainer">
                      <div className="co-flipSwitch" role="radiogroup" aria-label="Тип заявки">
                        <input
                          type="radio"
                          id="co-orderType-greenwich"
                          name="co-orderType"
                          checked={orderType === "greenwich"}
                          onChange={() => setOrderType("greenwich")}
                        />
                        <input
                          type="radio"
                          id="co-orderType-external"
                          name="co-orderType"
                          checked={orderType === "external"}
                          onChange={() => setOrderType("external")}
                        />

                        <label htmlFor="co-orderType-greenwich" className="co-switchButton">
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>
                          </svg>
                          <span>Grinvich</span>
                          <span className="co-switchSub">на сотрудника</span>
                        </label>

                        <label htmlFor="co-orderType-external" className="co-switchButton">
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z"></path>
                          </svg>
                          <span>3-и лица</span>
                          <span className="co-switchSub">сторонний заказчик</span>
                        </label>

                        <div className="co-switchCard" aria-hidden="true">
                          <div className="co-cardFace co-cardFront" />
                          <div className="co-cardFace co-cardBack" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="co-grid">
                  {isWarehouse && orderType === "greenwich" ? (
                    <label className="co-field">
                      <div className="co-label">Сотрудник Grinvich *</div>
                      <select
                        value={greenwichUserId}
                        onChange={(e) => setGreenwichUserId(e.target.value)}
                        className="co-input"
                      >
                        <option value="">Выберите сотрудника</option>
                        {greenwichUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName}
                          </option>
                        ))}
                      </select>
                      {greenwichUsers.length === 0 ? (
                        <div className="co-help">Нет активных сотрудников Grinvich.</div>
                      ) : null}
                    </label>
                  ) : null}
                  <label className="co-field">
                    <div className="co-label">Заказчик *</div>
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      className="co-input"
                    >
                      <option value="">Выберите заказчика</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {customers.length === 0 ? (
                      <div className="co-help">Нет заказчиков. Создайте в админке.</div>
                    ) : null}
                  </label>
                  <label className="co-field">
                    <div className="co-label">Название мероприятия</div>
                    <input
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      className="co-input"
                      placeholder="Название мероприятия"
                    />
                  </label>
                </div>

                <label className="co-field">
                  <div className="co-label">Комментарий</div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="co-textarea"
                    placeholder="Комментарий к заявке…"
                  />
                </label>

                <div className="co-services">
                  <div className="co-servicesTitle">Доп. услуги</div>
                  <div className="co-serviceRow">
                    <Toggle checked={deliveryEnabled} onChange={setDeliveryEnabled} label="Доставка" />
                    {deliveryEnabled ? (
                      <>
                        {isGreenwich ? (
                          <textarea
                            value={deliveryComment}
                            onChange={(e) => setDeliveryComment(e.target.value)}
                            className="co-textarea co-textarea--compact"
                            placeholder="Комментарий к доставке…"
                          />
                        ) : (
                          <label className="co-priceRow">
                            <span className="co-priceLabel">Стоимость, р</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={deliveryPrice}
                              onChange={(e) => setDeliveryPrice(e.target.value)}
                              className="co-input co-input--price"
                              placeholder="0"
                            />
                          </label>
                        )}
                      </>
                    ) : null}
                  </div>
                  <div className="co-serviceRow">
                    <Toggle checked={montageEnabled} onChange={setMontageEnabled} label="Монтаж" />
                    {montageEnabled ? (
                      <>
                        {isGreenwich ? (
                          <textarea
                            value={montageComment}
                            onChange={(e) => setMontageComment(e.target.value)}
                            className="co-textarea co-textarea--compact"
                            placeholder="Комментарий к монтажу…"
                          />
                        ) : (
                          <label className="co-priceRow">
                            <span className="co-priceLabel">Стоимость, р</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={montagePrice}
                              onChange={(e) => setMontagePrice(e.target.value)}
                              className="co-input co-input--price"
                              placeholder="0"
                            />
                          </label>
                        )}
                      </>
                    ) : null}
                  </div>
                  <div className="co-serviceRow">
                    <Toggle checked={demontageEnabled} onChange={setDemontageEnabled} label="Демонтаж" />
                    {demontageEnabled ? (
                      <>
                        {isGreenwich ? (
                          <textarea
                            value={demontageComment}
                            onChange={(e) => setDemontageComment(e.target.value)}
                            className="co-textarea co-textarea--compact"
                            placeholder="Комментарий к демонтажу…"
                          />
                        ) : (
                          <label className="co-priceRow">
                            <span className="co-priceLabel">Стоимость, р</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={demontagePrice}
                              onChange={(e) => setDemontagePrice(e.target.value)}
                              className="co-input co-input--price"
                              placeholder="0"
                            />
                          </label>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>

                {error ? <div className="co-error">{error}</div> : null}

                <div className="cart-footer" style={{ marginTop: "1.5rem" }}>
                  <div className="cart-total" style={{ fontSize: "1.35rem" }}>
                    {isWarehouse && (deliveryPriceNum > 0 || montagePriceNum > 0 || demontagePriceNum > 0) ? (
                      <>
                        Итого: <strong>{totalWithServices.toFixed(0)}</strong>{" "}
                        <span className="cart-unit">р</span>
                        <span className="cart-total-detail">
                          {" "}(аренда {totalForPeriod.toFixed(0)} + доп. услуги {deliveryPriceNum + montagePriceNum + demontagePriceNum} р)
                        </span>
                      </>
                    ) : (
                      <>
                        Итого за период: <strong>{totalForPeriod.toFixed(0)}</strong>{" "}
                        <span className="cart-unit">р</span>
                      </>
                    )}
                  </div>
                  <p className="cart-muted cart-note">
                    Точная смета и доступность подтверждаются складом после создания заявки.
                  </p>
                  <button
                    type="button"
                    disabled={!canCheckout || submitting || customers.length === 0}
                    onClick={submit}
                    className="co-btn co-btn--primary"
                  >
                    {submitting ? "Создаём заявку…" : "Создать заявку"}
                  </button>
                </div>
              </>
            ) : (
              <div className="cart-footer" style={{ marginTop: "1rem" }}>
                <div className="cart-total">
                  {rentalDays > 0 ? (
                    <>
                      Итого за период: <strong>{totalForPeriod.toFixed(0)}</strong>{" "}
                      <span className="cart-unit">р</span>
                    </>
                  ) : (
                    <>
                      Итого в день: <strong>{totalPerDay.toFixed(0)}</strong>{" "}
                      <span className="cart-unit">р/сут</span>
                    </>
                  )}
                </div>
                <p className="cart-muted cart-note">
                  Оформление заявки доступно только для Grinvich. Перейди в каталог, чтобы продолжить.
                </p>
              </div>
            )}
          </>
        )}

        {mounted &&
          typeof document !== "undefined" &&
          createPortal(
            <Link href="/catalog" className="cart-floatCatalog" aria-label="В каталог">
              ← В каталог
            </Link>,
            document.body
          )}
      </section>
    </AppShell>
  );
}
