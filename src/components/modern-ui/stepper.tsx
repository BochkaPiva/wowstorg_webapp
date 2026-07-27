"use client";

import React from "react";

export type Step = { id: number; title: string; subtitle?: string };

type Tone = "violet" | "amber" | "slate";

function toneClasses(tone: Tone) {
  if (tone === "amber") {
    return {
      active: "border-amber-400 bg-amber-400 text-black",
      line: "bg-amber-400",
    };
  }
  if (tone === "violet") {
    return {
      active: "border-violet-700 bg-violet-700 text-white",
      line: "bg-violet-700",
    };
  }
  return {
    active: "border-zinc-950 bg-zinc-950 text-white",
    line: "bg-zinc-950",
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
  windowSize = 7,
  density = "regular",
}: {
  steps: Step[];
  activeStep: number;
  tone?: Tone;
  className?: string;
  windowSize?: number;
  density?: "regular" | "compact";
}) {
  const { active, line } = toneClasses(tone);
  const total = Math.max(1, steps.length);
  const current = Math.min(Math.max(1, activeStep), total);
  const currentIdx = current - 1;

  const safeWindow = Math.max(3, Math.min(8, windowSize));
  const half = Math.floor(safeWindow / 2);
  const wanted = new Set<number>([0, total - 1]);
  for (let index = currentIdx - half; index <= currentIdx + half; index += 1) {
    if (index >= 0 && index < total) wanted.add(index);
  }
  const sorted = Array.from(wanted).sort((a, b) => a - b);

  type DisplayItem = { type: "step"; idx: number } | { type: "ellipsis"; key: string };
  const display: DisplayItem[] = [];
  sorted.forEach((idx, position) => {
    const previous = sorted[position - 1];
    if (previous !== undefined && idx - previous > 1) {
      display.push({ type: "ellipsis", key: `ellipsis-${previous}-${idx}` });
    }
    display.push({ type: "step", idx });
  });

  return (
    <div
      className={["w-full overflow-x-auto pb-1", className ?? ""].join(" ")}
      data-density={density}
    >
      <div className={["flex items-start", density === "compact" ? "min-w-[540px]" : "min-w-[620px]"].join(" ")}>
        {display.map((item, position) => {
          if (item.type === "ellipsis") {
            return (
              <div
                key={item.key}
                className={[
                  "flex flex-col items-center",
                  density === "compact" ? "min-w-6 pt-2" : "min-w-8 pt-3",
                ].join(" ")}
                aria-hidden="true"
              >
                <span className={density === "compact"
                  ? "text-xs font-bold tracking-[0.14em] text-zinc-400"
                  : "text-sm font-bold tracking-[0.18em] text-zinc-400"}
                >
                  •••
                </span>
              </div>
            );
          }

          const step = steps[item.idx]!;
          const completed = item.idx < currentIdx;
          const isActive = item.idx === currentIdx;
          const next = display[position + 1];
          const showConnector = next?.type === "step";

          return (
            <React.Fragment key={step.id}>
              <div
                className={[
                  "flex flex-col items-center",
                  density === "compact" ? "min-w-[52px] gap-1" : "min-w-[62px] gap-1.5",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex shrink-0 items-center justify-center rounded-full border font-bold",
                    density === "compact" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]",
                    "transition-colors duration-150 motion-reduce:transition-none",
                    completed
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : isActive
                        ? active
                        : "border-zinc-300 bg-white text-zinc-500",
                  ].join(" ")}
                  title={step.subtitle ? `${step.title} — ${step.subtitle}` : step.title}
                  aria-label={step.title}
                  aria-current={isActive ? "step" : undefined}
                >
                  {completed ? <CheckIcon className="h-3.5 w-3.5" /> : item.idx + 1}
                </div>
                <span
                  className={[
                    "text-center font-semibold leading-tight",
                    density === "compact" ? "max-w-[72px] text-[9px]" : "max-w-[86px] text-[10px]",
                    isActive || completed ? "text-zinc-950" : "text-zinc-500",
                  ].join(" ")}
                >
                  {step.title}
                </span>
              </div>

              {showConnector ? (
                <div
                  className={[
                    "min-w-5 flex-1 px-1",
                    density === "compact" ? "mt-[9px]" : "mt-[13px]",
                  ].join(" ")}
                >
                  <div className="h-px overflow-hidden bg-zinc-200">
                    <div className={["h-full w-full", completed ? line : "bg-transparent"].join(" ")} />
                  </div>
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
