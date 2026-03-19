"use client";

import React from "react";

export type Step = { id: number; title: string; subtitle?: string };

type Tone = "violet" | "amber" | "slate";

const COMPLETED_LINE = "bg-violet-600";

function toneClasses(tone: Tone) {
  if (tone === "amber") {
    return {
      activeRing: "border-amber-500 text-amber-700",
      activeLine: "bg-amber-500",
      glow: "shadow-[0_0_0_4px_rgba(245,158,11,0.18)]",
    };
  }
  if (tone === "violet") {
    return {
      activeRing: "border-violet-600 text-violet-700",
      activeLine: "bg-violet-600",
      glow: "shadow-[0_0_0_4px_rgba(124,58,237,0.18)]",
    };
  }
  return {
    activeRing: "border-slate-900 text-slate-900",
    activeLine: "bg-slate-900",
    glow: "shadow-[0_0_0_4px_rgba(15,23,42,0.12)]",
  };
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z" />
    </svg>
  );
}

export function Stepper({
  steps,
  activeStep,
  tone = "slate",
  className,
  windowSize = 5,
}: {
  steps: Step[];
  activeStep: number; // 1-based
  tone?: Tone;
  className?: string;
  windowSize?: number;
}) {
  const { activeRing, activeLine, glow } = toneClasses(tone);
  const total = Math.max(1, steps.length);
  const current = Math.min(Math.max(1, activeStep), total); // 1-based
  const currentIdx = current - 1; // 0-based
  const lastStepCompleted = activeStep > total; // e.g. CLOSED → шаг 8 с галочкой

  // Показ “окна” + всегда финальный шаг.
  const safeWindow = Math.max(3, Math.min(7, windowSize));
  const half = Math.floor(safeWindow / 2);
  const wanted = new Set<number>();
  wanted.add(0);
  wanted.add(total - 1);
  for (let i = currentIdx - half; i <= currentIdx + half; i++) {
    if (i >= 0 && i < total) wanted.add(i);
  }
  const sorted = Array.from(wanted).sort((a, b) => a - b);

  type DisplayItem = { type: "step"; idx: number } | { type: "ellipsis"; key: string };
  const display: DisplayItem[] = [];

  for (let k = 0; k < sorted.length; k++) {
    const idx = sorted[k]!;
    if (k > 0) {
      const prev = sorted[k - 1]!;
      if (idx - prev > 1) display.push({ type: "ellipsis", key: `e-${prev}-${idx}` });
    }
    display.push({ type: "step", idx });
  }

  function StepNode({
    s,
    stepNum,
    state,
  }: {
    s: Step;
    stepNum: number;
    state: "completed" | "active" | "pending";
  }) {
    const isCompleted = state === "completed";
    const isActive = state === "active";

    const circleClass = isCompleted
      ? "border-violet-600 bg-violet-600 text-white"
      : isActive
        ? ["bg-white", activeRing, glow].join(" ")
        : "border-slate-200 bg-white text-slate-400";

    const circleSize = isActive ? "h-10 w-10" : "h-7 w-7";
    const numSize = isActive ? "text-[13px]" : "text-[12px]";

    return (
      <div className="flex flex-col items-center gap-1 min-w-[64px]">
        <div
          className={[
            circleSize,
            "rounded-full border-2 flex items-center justify-center shrink-0 transition-transform",
            circleClass,
            isActive ? "scale-[1.06] animate-pulse" : "",
          ].join(" ")}
          title={s.subtitle ? `${s.title} — ${s.subtitle}` : s.title}
          aria-label={s.title}
        >
          {isCompleted ? <CheckIcon className="h-4 w-4" /> : <span className={[numSize, "font-semibold"].join(" ")}>{stepNum}</span>}
        </div>
        <div className={["text-[11px] font-semibold leading-tight text-center", isActive ? "text-slate-900" : isCompleted ? "text-slate-900" : "text-slate-500"].join(" ")}>
          {s.title}
        </div>
      </div>
    );
  }

  return (
    <div className={["w-full overflow-visible", className ?? ""].join(" ")}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 overflow-visible">
          <div className="flex items-start gap-3">
            {display.map((it, i) => {
              if (it.type === "ellipsis") {
                return (
                  <div key={it.key} className="flex flex-col items-center gap-1 min-w-[28px] pt-[16px]">
                    <div className="h-[3px] w-10 bg-slate-200 rounded-full" />
                    <div className="text-slate-400 font-semibold">…</div>
                  </div>
                );
              }

              const s = steps[it.idx]!;
              const stepNum = it.idx + 1;
              const state: "completed" | "active" | "pending" =
                it.idx < currentIdx
                  ? "completed"
                  : it.idx === currentIdx
                    ? lastStepCompleted && it.idx === total - 1
                      ? "completed"
                      : "active"
                    : "pending";

              const next = display[i + 1];
              const showConnector = next && next.type === "step";
              const connectorFilled = it.idx < currentIdx || (lastStepCompleted && it.idx === total - 1);

              return (
                <React.Fragment key={s.id}>
                  <StepNode s={s} stepNum={stepNum} state={state} />
                  {showConnector ? (
                    <div className="pt-[18px] flex-1 min-w-[48px]">
                      <div className="h-[2px] bg-slate-200 rounded-full overflow-hidden">
                        <div className={["h-full rounded-full", connectorFilled ? COMPLETED_LINE : "bg-transparent"].join(" ")} />
                      </div>
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

