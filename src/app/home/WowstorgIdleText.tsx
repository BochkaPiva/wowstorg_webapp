"use client";

import React from "react";

type Dot = { x: number; y: number; ox: number; oy: number; vx: number; vy: number; a: number };

export function WowstorgIdleText() {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dotsRef = React.useRef<Dot[]>([]);
  const rafRef = React.useRef<number | null>(null);
  const mouseRef = React.useRef({ x: -9999, y: -9999, active: false });

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rebuild = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${Math.floor(rect.width)}px`;
      canvas.style.height = `${Math.floor(rect.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const tmp = document.createElement("canvas");
      tmp.width = Math.max(1, Math.floor(rect.width));
      tmp.height = Math.max(1, Math.floor(rect.height));
      const tctx = tmp.getContext("2d");
      if (!tctx) return;
      tctx.clearRect(0, 0, tmp.width, tmp.height);
      const line1 = "WoW";
      const line2 = "STORG";
      const fontSize = Math.max(64, Math.min(220, Math.floor(Math.min(rect.width * 0.34, rect.height * 0.48))));
      tctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`;
      tctx.textAlign = "center";
      tctx.textBaseline = "middle";
      tctx.fillStyle = "#7c3aed";
      const centerX = tmp.width / 2;
      const centerY = tmp.height / 2;
      const lineGap = Math.max(22, Math.floor(fontSize * 1.08));
      tctx.fillText(line1, centerX, centerY - lineGap / 2);
      tctx.fillText(line2, centerX, centerY + lineGap / 2);

      const img = tctx.getImageData(0, 0, tmp.width, tmp.height);
      const dots: Dot[] = [];
      for (let y = 0; y < tmp.height; y += 4) {
        for (let x = 0; x < tmp.width; x += 4) {
          const alpha = img.data[(y * tmp.width + x) * 4 + 3] ?? 0;
          if (alpha > 120) {
            dots.push({ x, y, ox: x, oy: y, vx: 0, vy: 0, a: alpha / 255 });
          }
        }
      }
      if (dots.length > 0) {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const d of dots) {
          if (d.x < minX) minX = d.x;
          if (d.x > maxX) maxX = d.x;
          if (d.y < minY) minY = d.y;
          if (d.y > maxY) maxY = d.y;
        }
        const boxCx = (minX + maxX) / 2;
        const boxCy = (minY + maxY) / 2;
        const dx = Math.round(tmp.width / 2 - boxCx);
        const dy = Math.round(tmp.height / 2 - boxCy);
        for (const d of dots) {
          d.x += dx;
          d.y += dy;
          d.ox += dx;
          d.oy += dy;
        }
      }
      dotsRef.current = dots;

    };

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (const p of dotsRef.current) {
        if (mouseRef.current.active) {
          const dx = p.x - mouseRef.current.x;
          const dy = p.y - mouseRef.current.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 170 * 170 && dist2 > 0.001) {
            const f = (170 * 170 - dist2) / (170 * 170);
            const inv = 1 / Math.sqrt(dist2);
            p.vx += dx * inv * f * 1.05;
            p.vy += dy * inv * f * 1.05;
          }
        }

        p.vx += (p.ox - p.x) * 0.05;
        p.vy += (p.oy - p.y) * 0.05;
        p.vx *= 0.85;
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;

        const disp = Math.hypot(p.x - p.ox, p.y - p.oy);
        const t = Math.min(1, disp / 16);
        const r = Math.round(124 + (250 - 124) * t);
        const g = Math.round(58 + (204 - 58) * t);
        const b = Math.round(237 + (21 - 237) * t);
        const alpha = Math.min(0.85, 0.2 + p.a * 0.6 + t * 0.15);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(p.x, p.y, 2.2, 2.2);
      }

      rafRef.current = window.requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, active: true };
    };
    const onLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
    };

    rebuild();
    draw();
    window.addEventListener("resize", rebuild);
    wrap.addEventListener("pointermove", onMove, { passive: true });
    wrap.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("resize", rebuild);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative h-[280px] overflow-hidden rounded-2xl"
      aria-hidden
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

