"use client";

import React from "react";

type TowerBlock = { id: number; width: number; offset: number };

const BASE_WIDTH = 210;
const TRAVEL = 116;
const BLOCK_HEIGHT = 23;

function initialTower(): TowerBlock[] {
  return [{ id: 0, width: BASE_WIDTH, offset: 0 }];
}

export function BackgroundStackGame() {
  const [blocks, setBlocks] = React.useState<TowerBlock[]>(initialTower);
  const [ended, setEnded] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const activeRef = React.useRef<HTMLDivElement | null>(null);
  const activeXRef = React.useRef(-TRAVEL);
  const directionRef = React.useRef(1);
  const frameRef = React.useRef<number | null>(null);
  const lastTimeRef = React.useRef(0);
  const reducedMotionRef = React.useRef(false);

  const score = Math.max(0, blocks.length - 1);
  const topBlock = blocks[blocks.length - 1] ?? initialTower()[0]!;

  React.useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!started || ended || reducedMotionRef.current) {
      activeXRef.current = topBlock.offset;
      if (activeRef.current) activeRef.current.style.transform = `translateX(${topBlock.offset}px)`;
      return;
    }

    const tick = (time: number) => {
      const delta = Math.min(40, time - (lastTimeRef.current || time));
      lastTimeRef.current = time;
      let next = activeXRef.current + directionRef.current * delta * 0.105;
      if (next >= TRAVEL) {
        next = TRAVEL;
        directionRef.current = -1;
      } else if (next <= -TRAVEL) {
        next = -TRAVEL;
        directionRef.current = 1;
      }
      activeXRef.current = next;
      if (activeRef.current) activeRef.current.style.transform = `translateX(${next}px)`;
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTimeRef.current = 0;
    };
  }, [ended, started, topBlock.offset]);

  function reportScore(value: number) {
    if (value <= 0) return;
    void fetch("/api/greenwich/tower-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: value }),
    }).catch(() => null);
  }

  function reset() {
    setBlocks(initialTower());
    setEnded(false);
    setStarted(false);
    activeXRef.current = -TRAVEL;
    directionRef.current = 1;
  }

  function placeBlock() {
    if (ended) {
      reset();
      return;
    }
    if (!started) {
      setStarted(true);
      activeXRef.current = reducedMotionRef.current ? 0 : -TRAVEL;
      return;
    }

    const previous = blocks[blocks.length - 1]!;
    const activeOffset = activeXRef.current;
    const difference = activeOffset - previous.offset;
    const overlap = previous.width - Math.abs(difference);

    if (overlap < 16) {
      setEnded(true);
      reportScore(score);
      return;
    }

    const nextOffset = previous.offset + difference / 2;
    setBlocks((current) => [
      ...current,
      { id: current.length, width: overlap, offset: nextOffset },
    ]);
    activeXRef.current = directionRef.current > 0 ? -TRAVEL : TRAVEL;
  }

  const visibleBlocks = blocks.slice(-8);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white" aria-label="Башня">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">Башня</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {!started ? "Нажми на поле, чтобы начать" : ended ? "Промах. Нажми, чтобы начать заново" : "Поставь блок кликом или пробелом"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-zinc-500">Счёт</div>
          <div className="text-xl font-bold tabular-nums text-violet-800">{score}</div>
        </div>
      </header>

      <button
        type="button"
        className="relative block h-[280px] w-full overflow-hidden border-0 bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-violet-700"
        onClick={placeBlock}
        onKeyDown={(event) => {
          if (event.code === "Space") {
            event.preventDefault();
            placeBlock();
          }
        }}
        aria-label={ended ? "Начать башню заново" : "Поставить блок башни"}
      >
        <span className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[11px] font-medium text-zinc-400">
          {!started ? "Старт" : ended ? `Результат: ${score}` : "Клик / пробел"}
        </span>

        <span className="pointer-events-none absolute inset-x-0 bottom-10 flex h-[210px] items-end justify-center">
          <span className="relative block h-full w-[460px] max-w-full">
            {visibleBlocks.map((block, index) => (
              <span
                key={block.id}
                className="absolute left-1/2 block border border-violet-900/10 bg-violet-500"
                style={{
                  width: block.width,
                  height: BLOCK_HEIGHT,
                  bottom: index * BLOCK_HEIGHT,
                  transform: `translateX(calc(-50% + ${block.offset}px))`,
                  backgroundColor: index % 2 === 0 ? "#7c3aed" : "#8b5cf6",
                }}
              />
            ))}
            {started && !ended ? (
              <span
                ref={activeRef}
                className="absolute left-1/2 block border border-yellow-700/20 bg-yellow-400"
                style={{
                  width: topBlock.width,
                  height: BLOCK_HEIGHT,
                  bottom: visibleBlocks.length * BLOCK_HEIGHT,
                  marginLeft: -topBlock.width / 2,
                  transform: "translateX(0px)",
                }}
              />
            ) : null}
          </span>
        </span>
      </button>
    </section>
  );
}
