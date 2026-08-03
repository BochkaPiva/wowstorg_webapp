"use client";

import Link from "next/link";
import React from "react";
import { createPortal } from "react-dom";

import type { CartLine } from "@/lib/cart";

export type MiniCartItem = {
  id: string;
  name: string;
  pricePerDay: string;
  photo1Key: string | null;
  availability: { availableNow: number; availableForDates?: number };
};

type CatalogMiniCartProps = {
  open: boolean;
  lines: CartLine[];
  items: Map<string, MiniCartItem>;
  checkoutHref: string;
  rentalDays: number;
  total: number;
  demoMode: boolean;
  onClose: () => void;
  onSetQty: (itemId: string, qty: number) => void;
  onClear: () => void;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value) + " ₽";
}

export function CatalogMiniCart({
  open,
  lines,
  items,
  checkoutHref,
  rentalDays,
  total,
  demoMode,
  onClose,
  onSetQty,
  onClear,
}: CatalogMiniCartProps) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 30);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!mounted) return null;

  const quantity = lines.reduce((sum, line) => sum + line.qty, 0);
  const periodLabel = demoMode
    ? "Предварительно за 1 день"
    : rentalDays > 0
      ? `За ${rentalDays} ${rentalDays === 1 ? "день" : rentalDays < 5 ? "дня" : "дней"}`
      : "За выбранный период";

  return createPortal(
    <div className={["mk-miniCartLayer", open ? "is-open" : ""].join(" ")} aria-hidden={!open}>
      <button
        type="button"
        className="mk-miniCartBackdrop"
        aria-label="Закрыть корзину"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className="mk-miniCart"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mini-cart-title"
      >
        <header className="mk-miniCartHeader">
          <div>
            <div className="mk-miniCartEyebrow">Ваш выбор</div>
            <h2 id="mini-cart-title">Корзина</h2>
            <p>{quantity > 0 ? `${quantity} поз. в подборке` : "Пока пусто"}</p>
          </div>
          <button ref={closeRef} type="button" className="mk-miniCartClose" onClick={onClose} aria-label="Закрыть">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="mk-miniCartEmpty">
            <div className="mk-miniCartEmptyMark" aria-hidden="true">+</div>
            <h3>Добавьте первый реквизит</h3>
            <p>Выбранные позиции появятся здесь — каталог останется на месте.</p>
            <button type="button" className="mk-miniCartSecondary" onClick={onClose}>Продолжить выбор</button>
          </div>
        ) : (
          <>
            <div className="mk-miniCartUtility">
              <span>{periodLabel}</span>
              <button type="button" onClick={onClear}>Очистить</button>
            </div>
            <div className="mk-miniCartList">
              {lines.map((line) => {
                const item = items.get(line.itemId);
                const price = line.pricePerDay ?? Number(item?.pricePerDay ?? 0);
                const lineTotal = price * line.qty * (demoMode ? 1 : Math.max(rentalDays, 1));
                const available = item
                  ? demoMode
                    ? item.availability.availableNow
                    : item.availability.availableForDates ?? item.availability.availableNow
                  : Math.max(line.qty, 1);
                return (
                  <article className="mk-miniCartLine" key={line.itemId}>
                    <div className="mk-miniCartMedia">
                      {item?.photo1Key ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/inventory/positions/${line.itemId}/photo?w=180`} alt="" />
                      ) : (
                        <span aria-hidden="true">{item?.name?.slice(0, 1) ?? "…"}</span>
                      )}
                    </div>
                    <div className="mk-miniCartLineBody">
                      <div className="mk-miniCartLineTop">
                        <div>
                          <h3>{item?.name ?? "Загрузка позиции…"}</h3>
                          <p>{formatMoney(price)} / сутки</p>
                        </div>
                        <button
                          type="button"
                          className="mk-miniCartRemove"
                          onClick={() => onSetQty(line.itemId, 0)}
                          aria-label={`Удалить ${item?.name ?? "позицию"}`}
                        >
                          Удалить
                        </button>
                      </div>
                      <div className="mk-miniCartLineBottom">
                        <div className="mk-miniCartQty" aria-label={`Количество ${item?.name ?? "позиции"}`}>
                          <button type="button" onClick={() => onSetQty(line.itemId, line.qty - 1)} aria-label="Уменьшить количество">−</button>
                          <span aria-live="polite">{line.qty}</span>
                          <button
                            type="button"
                            onClick={() => onSetQty(line.itemId, line.qty + 1)}
                            disabled={line.qty >= available}
                            aria-label="Увеличить количество"
                          >+
                          </button>
                        </div>
                        <strong>{formatMoney(lineTotal)}</strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <footer className="mk-miniCartFooter">
              <div className="mk-miniCartTotal">
                <span>{periodLabel}</span>
                <strong aria-live="polite">{formatMoney(total)}</strong>
              </div>
              <Link href={checkoutHref} className="mk-miniCartCheckout" onClick={onClose}>
                Перейти к оформлению <span aria-hidden="true">→</span>
              </Link>
              <button type="button" className="mk-miniCartSecondary" onClick={onClose}>Продолжить выбор</button>
            </footer>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
