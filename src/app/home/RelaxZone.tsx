"use client";

import React from "react";
import { createPortal } from "react-dom";

type Dot = { x: number; y: number; vx: number; vy: number; r: number };

function createDots(width: number, height: number, count: number): Dot[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.45,
    vy: (Math.random() - 0.5) * 0.45,
    r: 0.8 + Math.random() * 1.2,
  }));
}

export function RelaxZone() {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dotsRef = React.useRef<Dot[]>([]);
  const rafRef = React.useRef<number | null>(null);
  const mouseRef = React.useRef({ x: -10_000, y: -10_000, active: false });
  const reducedRef = React.useRef(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rebuild = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dotsRef.current = createDots(Math.floor(rect.width), Math.floor(rect.height), 120);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const onLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.x = -10_000;
      mouseRef.current.y = -10_000;
    };

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (const d of dotsRef.current) {
        if (mouseRef.current.active && !reducedRef.current) {
          const dx = d.x - mouseRef.current.x;
          const dy = d.y - mouseRef.current.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 120 * 120 && dist2 > 0.001) {
            const force = (120 * 120 - dist2) / (120 * 120);
            const inv = 1 / Math.sqrt(dist2);
            d.vx += dx * inv * force * 0.045;
            d.vy += dy * inv * force * 0.045;
          }
        }
        d.x += d.vx;
        d.y += d.vy;
        d.vx *= 0.993;
        d.vy *= 0.993;
        if (d.x < 0 || d.x > rect.width) d.vx *= -1;
        if (d.y < 0 || d.y > rect.height) d.vy *= -1;
        d.x = Math.max(0, Math.min(rect.width, d.x));
        d.y = Math.max(0, Math.min(rect.height, d.y));
      }

      for (let i = 0; i < dotsRef.current.length; i++) {
        const a = dotsRef.current[i]!;
        for (let j = i + 1; j < dotsRef.current.length; j++) {
          const b = dotsRef.current[j]!;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 54) {
            const alpha = (1 - dist / 54) * 0.12;
            ctx.strokeStyle = `rgba(124,58,237,${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const d of dotsRef.current) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(124,58,237,0.28)";
        ctx.fill();
      }

      rafRef.current = window.requestAnimationFrame(draw);
    };

    rebuild();
    draw();
    window.addEventListener("resize", rebuild);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("resize", rebuild);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div
      ref={wrapRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[4] h-[46vh] min-h-[280px] max-h-[520px] overflow-hidden [mask-image:linear-gradient(to_top,black_0%,black_86%,transparent_100%)] [mask-repeat:no-repeat]"
      aria-hidden
    >
      <canvas ref={canvasRef} className="h-full w-full block opacity-80" />
    </div>,
    document.body,
  );
}

