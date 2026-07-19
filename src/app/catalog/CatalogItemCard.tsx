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
  displayIndex,
  qtyInCart,
  onDetail,
  onAdd,
  onDec,
  onInc,
  onSetQty,
}: {
  item: CatalogGridItem;
  displayIndex: number;
  qtyInCart: number;
  onDetail: (id: string) => void;
  onAdd: (id: string, pricePerDay: number) => void;
  onDec: (id: string, currentQty: number) => void;
  onInc: (id: string, currentQty: number) => void;
  onSetQty: (id: string, qty: number) => void;
}) {
  const availability = item.availability ?? { availableNow: 0 };
  const available = availability.availableForDates ?? availability.availableNow ?? 0;
  const canAdd = available > qtyInCart;
  const priceNum = Number(item.pricePerDay);
  const [qtyDraft, setQtyDraft] = React.useState<string>(qtyInCart > 0 ? String(qtyInCart) : "");

  React.useEffect(() => {
    setQtyDraft(qtyInCart > 0 ? String(qtyInCart) : "");
  }, [qtyInCart]);

  function commitQty(raw: string) {
    if (raw.trim() === "") {
      onSetQty(item.id, 0);
      setQtyDraft("");
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      onSetQty(item.id, 0);
      setQtyDraft("");
      return;
    }
    const cap = Math.max(0, available);
    const capped = cap <= 0 ? 0 : Math.min(parsed, cap);
    onSetQty(item.id, capped);
    setQtyDraft(capped > 0 ? String(capped) : "");
  }

  return (
    <article className="mk-card">
      <div className="mk-cardInner">
        <span className="mk-cardNumber" aria-hidden="true">{String(displayIndex).padStart(2, "0")}</span>
        <div className="mk-box">
          {item.photo1Key ? (
            <img
              src={`/api/inventory/positions/${item.id}/photo?w=480`}
              alt=""
              className="mk-cardPhoto"
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 320px"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
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

      </div>

      <div className="mk-content">
        <div className="mk-meta">
          <span className="mk-pill">{typeLabelRu(item.type)}</span>
        </div>
        <button type="button" className="mk-cardLink" onClick={() => onDetail(item.id)}>
          <div className="mk-name">{item.name}</div>
        </button>
        {item.description?.trim() ? <div className="mk-desc">{item.description}</div> : null}

        <div className="mk-cardFacts">
          <div className="mk-price">
            <strong>{item.pricePerDay}</strong>
            <span className="mk-priceUnit">₽ / сутки</span>
          </div>
          <span className="mk-available">В наличии: <strong>{available}</strong></span>
        </div>

        <div className="mk-actions">
          <button type="button" className="mk-detailBtn" onClick={() => onDetail(item.id)}>
            Подробнее <span aria-hidden="true">→</span>
          </button>
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
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={qtyDraft}
                onChange={(e) => {
                  let next = e.target.value.replace(/\D+/g, "");
                  if (next !== "" && available > 0) {
                    const n = Number.parseInt(next, 10);
                    if (Number.isFinite(n) && n > available) next = String(available);
                  }
                  setQtyDraft(next);
                }}
                onBlur={() => commitQty(qtyDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitQty(qtyDraft);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                aria-label="Количество"
              />
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
