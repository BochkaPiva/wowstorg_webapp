"use client";

import React from "react";

import "./catalog-related-sticky.css";

function relatedCountLabel(count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const mod10 = safe % 10;
  const mod100 = safe % 100;
  if (mod10 === 1 && mod100 !== 11) return `${safe} рекомендация к корзине`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${safe} рекомендации к корзине`;
  }
  return `${safe} рекомендаций к корзине`;
}

type Props = {
  suggestionCount: number;
  children: React.ReactNode;
};

export function CatalogRelatedStickyShell({ suggestionCount, children }: Props) {
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const [compact, setCompact] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Сворачиваем только после прокрутки мимо блока (sentinel ушёл вверх).
        // Если блок ещё ниже экрана — показываем полный список, иначе он «пропадает».
        const scrolledPast = entry.boundingClientRect.top < 0;
        const nextCompact = scrolledPast && !entry.isIntersecting;
        setCompact(nextCompact);
        if (!nextCompact) setExpanded(false);
      },
      { threshold: 0, rootMargin: "-3.85rem 0px 0px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const showFull = !compact || expanded;

  return (
    <>
      <div ref={sentinelRef} className="mk-relatedSentinel" aria-hidden="true" />
      <div
        className={[
          "mk-relatedSticky",
          compact ? "mk-relatedSticky--compact" : "",
          compact && expanded ? "mk-relatedSticky--expanded" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {compact ? (
          <button
            type="button"
            className="mk-relatedCompactBar"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="mk-relatedCompactBar-label">{relatedCountLabel(suggestionCount)}</span>
            <span className="mk-relatedCompactBar-action">{expanded ? "Свернуть" : "Показать"}</span>
          </button>
        ) : null}
        <div
          className={[
            "mk-relatedSticky-body",
            showFull ? "" : "mk-relatedSticky-body--hidden",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden={!showFull}
        >
          {children}
        </div>
      </div>
    </>
  );
}
