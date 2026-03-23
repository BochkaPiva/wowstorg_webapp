"use client";

import React from "react";

export type CatalogGridItem = {
  id: string;
  name: string;
  description: string | null;
  type: "ASSET" | "BULK" | "CONSUMABLE";
  pricePerDay: string;
  photo1Key: string | null;
  availability: { availableNow: number; availableForDates?: number };
};

function typeLabelRu(t: CatalogGridItem["type"]) {
  switch (t) {
    case "ASSET":
      return "Штучный";
    case "BULK":
      return "Мерный";
    case "CONSUMABLE":
      return "Расходник";
  }
}

export const CatalogItemCard = React.memo(function CatalogItemCard({
  item,
  qtyInCart,
  onDetail,
  onAdd,
  onDec,
  onInc,
}: {
  item: CatalogGridItem;
  qtyInCart: number;
  onDetail: (id: string) => void;
  onAdd: (id: string, pricePerDay: number) => void;
  onDec: (id: string, currentQty: number) => void;
  onInc: (id: string, currentQty: number) => void;
}) {
  const available = item.availability.availableForDates ?? item.availability.availableNow;
  const canAdd = available > qtyInCart;
  const priceNum = Number(item.pricePerDay);

  return (
    <article className="mk-card">
      <div className="mk-cardInner">
        <div className="mk-box">
          {item.photo1Key ? (
            <img
              src={`/api/inventory/positions/${item.id}/photo`}
              alt=""
              className="mk-cardPhoto"
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 320px"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "inherit",
              }}
            />
          ) : (
            <div className="mk-placeholder">
              <div className="mk-placeholderBadge">
                <span style={{ color: "var(--mk-violet)" }}>WOWSTORG</span>
                <span style={{ opacity: 0.7 }}>·</span>
                <span>без фото</span>
              </div>
            </div>
          )}
        </div>

        <div className="mk-corner">
          <button
            type="button"
            className="mk-cornerBtn"
            onClick={() => onDetail(item.id)}
            aria-label="Подробнее"
            title="Подробнее"
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z" />
              <path d="M5 5h6v2H7v10h10v-4h2v6H5V5z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mk-content">
        <div className="mk-nameRow">
          <button type="button" className="mk-cardLink" onClick={() => onDetail(item.id)}>
            <div className="mk-name">{item.name}</div>
          </button>
          <div className="mk-price">
            <strong>{item.pricePerDay}</strong>
            <span className="mk-priceUnit">р/сут</span>
          </div>
        </div>
        <div className="mk-meta">
          <span className="mk-pill">{typeLabelRu(item.type)}</span>
          <span className="mk-available">
            Доступно: <strong>{available}</strong>
          </span>
        </div>
        <div className="mk-desc">
          {item.description?.trim()
            ? item.description
            : "Описание будет добавлено складом — пока можно оформить заявку по названию."}
        </div>

        <div className="mk-actions">
          {qtyInCart <= 0 ? (
            <button
              type="button"
              className="mk-addBtn"
              onClick={() => onAdd(item.id, priceNum)}
              disabled={!canAdd}
              title={!canAdd ? "Нет доступных на выбранные даты" : undefined}
            >
              В корзину
            </button>
          ) : (
            <div className="mk-qty" aria-label="Количество в корзине">
              <button type="button" onClick={() => onDec(item.id, qtyInCart)} aria-label="Минус">
                −
              </button>
              <span>{qtyInCart}</span>
              <button
                type="button"
                onClick={() => onInc(item.id, qtyInCart)}
                aria-label="Плюс"
                disabled={!canAdd}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
});
