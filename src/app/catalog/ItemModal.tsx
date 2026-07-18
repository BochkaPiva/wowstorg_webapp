"use client";

import React from "react";
import { createPortal } from "react-dom";

type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  type: "ASSET" | "BULK" | "CONSUMABLE";
  pricePerDay: string;
  photo1Key?: string | null;
  availability: { availableNow: number; availableForDates?: number };
};

function typeLabelRu(type: CatalogItem["type"]) {
  switch (type) {
    case "ASSET":
      return "Штучный реквизит";
    case "BULK":
      return "Мерный реквизит";
    case "CONSUMABLE":
      return "Расходный материал";
  }
}

export function ItemModal({
  item,
  qtyInCart,
  availableForDates,
  onClose,
  onAdd,
  onInc,
  onDec,
  onSetQty,
}: {
  item: CatalogItem;
  qtyInCart: number;
  availableForDates?: number;
  onClose: () => void;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  onSetQty: (qty: number) => void;
}) {
  const available = availableForDates ?? item.availability.availableNow;
  const canAddMore = available > qtyInCart;
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [qtyDraft, setQtyDraft] = React.useState<string>(qtyInCart > 0 ? String(qtyInCart) : "");

  React.useEffect(() => {
    setQtyDraft(qtyInCart > 0 ? String(qtyInCart) : "");
  }, [qtyInCart]);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function commitQty(raw: string) {
    if (raw.trim() === "") {
      onSetQty(0);
      setQtyDraft("");
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      onSetQty(0);
      setQtyDraft("");
      return;
    }
    const cap = Math.max(0, available);
    const capped = cap <= 0 ? 0 : Math.min(parsed, cap);
    onSetQty(capped);
    setQtyDraft(capped > 0 ? String(capped) : "");
  }

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isPreviewOpen) {
        setIsPreviewOpen(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPreviewOpen, onClose]);

  const modal = (
    <>
      <div
        className="mk-modalOverlay"
        onMouseDown={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-item-title"
      >
        <div className="mk-modal" onMouseDown={(event) => event.stopPropagation()}>
          <button className="mk-close" type="button" onClick={onClose} aria-label="Закрыть карточку">
            ×
          </button>

          <div className="mk-modalGrid">
            <div className="mk-modalMedia">
              {item.photo1Key ? (
                <button
                  type="button"
                  className="mk-modalMediaBtn"
                  onClick={() => setIsPreviewOpen(true)}
                  aria-label="Увеличить фотографию"
                >
                  <img
                    src={`/api/inventory/positions/${item.id}/photo`}
                    alt={item.name}
                    decoding="async"
                  />
                  <span className="mk-modalMediaHint">Увеличить</span>
                </button>
              ) : (
                <div className="mk-modalPlaceholder">
                  <span>Фото пока нет</span>
                </div>
              )}
            </div>

            <article className="mk-modalBody">
              <span className="mk-modalEyebrow">{typeLabelRu(item.type)}</span>
              <h2 id="catalog-item-title" className="mk-modalTitle">
                {item.name}
              </h2>
              <p className="mk-modalDescription">
                {item.description?.trim() || "Описание пока не добавлено."}
              </p>

              <div className="mk-modalFacts" aria-label="Цена и наличие">
                <div>
                  <span>Аренда</span>
                  <strong>{item.pricePerDay} ₽ / сутки</strong>
                </div>
                <div>
                  <span>В наличии</span>
                  <strong>{available}</strong>
                </div>
              </div>

              <div className="mk-modalActions">
                {qtyInCart <= 0 ? (
                  <button
                    className="mk-modalAddBtn"
                    type="button"
                    onClick={onAdd}
                    disabled={!canAddMore}
                    title={!canAddMore ? "Нет доступных на выбранные даты" : undefined}
                  >
                    {canAddMore ? "Добавить в корзину" : "Нет в наличии"}
                    {canAddMore ? <span aria-hidden="true">+</span> : null}
                  </button>
                ) : (
                  <div className="mk-modalQty" aria-label="Количество в корзине">
                    <button type="button" onClick={onDec} aria-label="Уменьшить количество">
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={qtyDraft}
                      onChange={(event) => {
                        let next = event.target.value.replace(/\D+/g, "");
                        if (next !== "" && available > 0) {
                          const value = Number.parseInt(next, 10);
                          if (Number.isFinite(value) && value > available) next = String(available);
                        }
                        setQtyDraft(next);
                      }}
                      onBlur={() => commitQty(qtyDraft)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitQty(qtyDraft);
                          event.currentTarget.blur();
                        }
                      }}
                      aria-label="Количество"
                    />
                    <button
                      type="button"
                      onClick={onInc}
                      aria-label="Увеличить количество"
                      disabled={!canAddMore}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>

              {availableForDates !== undefined ? (
                <p className="mk-modalAvailabilityNote">Наличие рассчитано на выбранный период аренды.</p>
              ) : null}
            </article>
          </div>
        </div>
      </div>

      {isPreviewOpen && item.photo1Key ? (
        <div
          className="mk-photoPreviewOverlay"
          onMouseDown={() => setIsPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Фото: ${item.name}`}
        >
          <button
            type="button"
            className="mk-photoPreviewClose"
            onClick={() => setIsPreviewOpen(false)}
            aria-label="Закрыть фотографию"
          >
            ×
          </button>
          <div className="mk-photoPreviewFrame" onMouseDown={(event) => event.stopPropagation()}>
            <img
              className="mk-photoPreviewImage"
              src={`/api/inventory/positions/${item.id}/photo`}
              alt={item.name}
            />
          </div>
        </div>
      ) : null}
    </>
  );

  if (typeof document !== "undefined") {
    return createPortal(modal, document.body);
  }
  return modal;
}
