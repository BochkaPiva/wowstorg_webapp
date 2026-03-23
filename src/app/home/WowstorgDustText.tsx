"use client";

import React from "react";

type Particle = {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
};

function createParticles(width: number, height: number, text: string): Particle[] {
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const octx = off.getContext("2d");
  if (!octx) return [];

  octx.clearRect(0, 0, width, height);
  octx.fillStyle = "#111827";
  octx.textAlign = "center";
  octx.textBaseline = "middle";
  octx.font = "700 72px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  octx.fillText(text, width / 2, height / 2);

  const img = octx.getImageData(0, 0, width, height);
  const data = img.data;
  const particles: Particle[] = [];
  const step = Math.max(3, Math.floor(width / 240));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4 + 3;
      if (data[idx] > 60) {
        particles.push({
          x,
          y,
          baseX: x,
          baseY: y,
          vx: 0,
          vy: 0,
          size: 1.8,
        });
      }
    }
  }
  return particles;
}

export function WowstorgDustText({
  text = "WowStorg",
  subtitle = "Move the cursor to scatter particles",
  embedded = false,
}: {
  text?: string;
  subtitle?: string;
  embedded?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const particlesRef = React.useRef<Particle[]>([]);
  const rafRef = React.useRef<number | null>(null);
  const mouseRef = React.useRef({ x: -10_000, y: -10_000, active: false });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particlesRef.current = createParticles(Math.floor(rect.width), Math.floor(rect.height), text);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.active = true;
    };

    const onLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.x = -10_000;
      mouseRef.current.y = -10_000;
    };

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (const p of particlesRef.current) {
        if (!reduced && mouseRef.current.active) {
          const dx = p.x - mouseRef.current.x;
          const dy = p.y - mouseRef.current.y;
          const d2 = dx * dx + dy * dy;
          const radius = 72;
          if (d2 < radius * radius && d2 > 0.001) {
            const force = (radius * radius - d2) / (radius * radius);
            const inv = 1 / Math.sqrt(d2);
            p.vx += dx * inv * force * 1.8;
            p.vy += dy * inv * force * 1.8;
          }
        }

        p.vx += (p.baseX - p.x) * 0.06;
        p.vy += (p.baseY - p.y) * 0.06;
        p.vx *= 0.86;
        p.vy *= 0.86;
        p.x += p.vx;
        p.y += p.vy;

        const speed = Math.min(1, Math.hypot(p.vx, p.vy) / 3);
        ctx.fillStyle = speed > 0.18 ? "#f59e0b" : "#7c3aed";
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      rafRef.current = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (embedded) {
    return (
      <div
        ref={wrapRef}
        className="rounded-2xl border border-white/80 bg-white/70 p-2 h-[220px] overflow-hidden"
        aria-label={`Интерактивный декоративный текст ${text}`}
      >
        <canvas ref={canvasRef} className="h-full w-full block" />
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-violet-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.12),rgba(245,158,11,0.12))] p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-zinc-900">{text}</div>
        <div className="text-xs text-zinc-600">{subtitle}</div>
      </div>
      <div
        ref={wrapRef}
        className="rounded-2xl border border-white/80 bg-white/70 p-2 h-[220px] overflow-hidden"
        aria-label={`Интерактивный декоративный текст ${text}`}
      >
        <canvas ref={canvasRef} className="h-full w-full block" />
      </div>
    </div>
  );
}

