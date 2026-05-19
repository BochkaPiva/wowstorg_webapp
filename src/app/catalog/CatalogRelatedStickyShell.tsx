"use client";

import React from "react";

function relatedCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} рекомендация к корзине`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} рекомендации к корзине`;
  }
  return `${count} рекомендаций к корзине`;
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
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextCompact = !entry?.isIntersecting;
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
