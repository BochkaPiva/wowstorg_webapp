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

function typeLabelRu(t: CatalogItem["type"]) {
  switch (t) {
    case "ASSET":
      return "Штучный";
    case "BULK":
      return "Мерный";
    case "CONSUMABLE":
      return "Расходник";
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
}: {
  item: CatalogItem;
  qtyInCart: number;
  availableForDates?: number;
  onClose: () => void;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
}) {
  const available = availableForDates ?? item.availability.availableNow;
  const canAddMore = available > qtyInCart;
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const modal = (
    <div className="mk-modalOverlay" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="mk-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mk-modalGrid">
          <div className="mk-modalMedia">
            {item.photo1Key ? (
              <img
                src={`/api/inventory/positions/${item.id}/photo`}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0, borderRadius: "inherit" }}
              />
            ) : (
              <div className="mk-placeholder" style={{ position: "absolute" }}>
                <div className="mk-placeholderBadge">WOWSTORG · PREVIEW</div>
              </div>
            )}
          </div>
          <div className="mk-modalBody">
            <div className="mk-modalTop">
              <div>
                <div className="mk-name" style={{ fontSize: "1.35rem" }}>
                  {item.name}
                </div>
                <div className="mk-meta">
                  <span className="mk-pill">{typeLabelRu(item.type)}</span>
                  <span className="mk-available">
                    Доступно:{" "}
                    <strong>{availableForDates ?? item.availability.availableNow}</strong>
                  </span>
                </div>
              </div>
              <button className="mk-close" onClick={onClose} aria-label="Закрыть">
                ✕
              </button>
            </div>

            <div className="mk-desc" style={{ WebkitLineClamp: "unset" as never }}>
              {item.description?.trim()
                ? item.description
                : "Описание пока не добавлено. Склад может заполнить его в инвентаре."}
            </div>

            <div className="mk-actions">
              <div className="mk-price">
                <strong>{item.pricePerDay}</strong>
                <span className="mk-priceUnit">р/сут</span>
              </div>

              {qtyInCart <= 0 ? (
                <button
                  className="mk-addBtn"
                  onClick={onAdd}
                  disabled={!canAddMore}
                  title={!canAddMore ? "Нет доступных на выбранные даты" : undefined}
                >
                  В корзину
                </button>
              ) : (
                <div className="mk-qty" aria-label="Количество в корзине">
                  <button onClick={onDec} aria-label="Минус">
                    −
                  </button>
                  <span>{qtyInCart}</span>
                  <button
                    onClick={onInc}
                    aria-label="Плюс"
                    disabled={!canAddMore}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            <div className="mk-subtitle" style={{ marginTop: "0.9rem" }}>
              Нажми <strong>Esc</strong> или кликни по фону, чтобы закрыть.
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modal, document.body);
  }
  return modal;
}

