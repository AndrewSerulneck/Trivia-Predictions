"use client";

import { useEffect, useRef } from "react";

type CoinFlightDetail = {
  sourceElementId?: string;
  sourceRect?: { left: number; top: number; width: number; height: number };
  sourceX?: number;
  sourceY?: number;
  delta?: number;
  coins?: number;
};

type CoinParticle = {
  id: string;
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
  startAt: number;
  durationMs: number;
  radius: number;
  spin: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveSource(detail?: CoinFlightDetail): { x: number; y: number } {
  if (detail?.sourceRect) {
    return {
      x: detail.sourceRect.left + detail.sourceRect.width / 2,
      y: detail.sourceRect.top + detail.sourceRect.height / 2,
    };
  }

  if (detail?.sourceElementId) {
    const source = document.getElementById(detail.sourceElementId);
    if (source) {
      const rect = source.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }

  if (typeof detail?.sourceX === "number" && typeof detail?.sourceY === "number") {
    return { x: detail.sourceX, y: detail.sourceY };
  }

  return {
    x: window.innerWidth * 0.5,
    y: Math.max(84, window.innerHeight * 0.78),
  };
}

function resolveDestination(): { x: number; y: number } {
  const target = document.getElementById("tp-treasure-chest-target") ?? document.getElementById("tp-treasure-chest");
  if (!target) {
    return {
      x: window.innerWidth * 0.8,
      y: 64,
    };
  }

  const rect = target.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, angle: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(1, 0.88);

  const glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.8);
  glow.addColorStop(0, "rgba(255, 244, 182, 0.5)");
  glow.addColorStop(1, "rgba(255, 214, 90, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.8, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createLinearGradient(-radius, -radius, radius, radius);
  body.addColorStop(0, "#fff3b0");
  body.addColorStop(0.55, "#f4b400");
  body.addColorStop(1, "#d79000");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = Math.max(1.5, radius * 0.18);
  ctx.strokeStyle = "#8b5b00";
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = Math.max(1, radius * 0.14);
  ctx.arc(-radius * 0.12, -radius * 0.12, radius * 0.52, Math.PI * 0.95, Math.PI * 1.85);
  ctx.stroke();

  ctx.restore();
}

export function CoinFXCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<CoinParticle[]>([]);
  const rafRef = useRef<number | null>(null);
  const idRef = useRef(0);
  const activeRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      return;
    }

    const resize = () => {
      const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const stopLoop = () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      activeRef.current = false;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const tick = (now: number) => {
      const particles = particlesRef.current;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const next: CoinParticle[] = [];
      for (const particle of particles) {
        const progress = (now - particle.startAt) / particle.durationMs;
        if (progress < 0) {
          next.push(particle);
          continue;
        }
        if (progress >= 1) {
          continue;
        }

        const t = clamp(progress, 0, 1);
        const oneMinusT = 1 - t;
        const x =
          oneMinusT * oneMinusT * particle.startX +
          2 * oneMinusT * t * particle.controlX +
          t * t * particle.endX;
        const y =
          oneMinusT * oneMinusT * particle.startY +
          2 * oneMinusT * t * particle.controlY +
          t * t * particle.endY;
        const scalePulse = 0.9 + Math.sin(t * Math.PI) * 0.35;
        const alpha = t < 0.1 ? t / 0.1 : Math.pow(1 - t, 0.55);
        const rotation = particle.spin * t * Math.PI * 2;

        drawCoin(context, x, y, particle.radius * scalePulse, rotation, alpha);
        next.push(particle);
      }

      particlesRef.current = next;
      if (next.length === 0) {
        stopLoop();
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (activeRef.current) {
        return;
      }
      activeRef.current = true;
      rafRef.current = window.requestAnimationFrame(tick);
    };

    const onCoinFlight = (event: Event) => {
      const custom = event as CustomEvent<CoinFlightDetail>;
      const detail = custom.detail;
      const source = resolveSource(detail);
      const destination = resolveDestination();
      const requestedCoins = Math.max(8, Math.min(36, detail?.coins ?? Math.round((detail?.delta ?? 10) / 2) + 10));
      const now = performance.now();

      const burst = Array.from({ length: requestedCoins }, (_, index) => {
        idRef.current += 1;
        const stagger = index * 24 + Math.round(Math.random() * 14);
        const startX = source.x + (Math.random() - 0.5) * 34;
        const startY = source.y + (Math.random() - 0.5) * 24;
        const endX = destination.x + (Math.random() - 0.5) * 22;
        const endY = destination.y + (Math.random() - 0.5) * 14;
        const curveLift = Math.max(42, Math.abs(endY - startY) * 0.38);
        const controlX = lerp(startX, endX, 0.5) + (Math.random() - 0.5) * 90;
        const controlY = Math.min(startY, endY) - curveLift - Math.random() * 32;
        return {
          id: `coin-${idRef.current}`,
          startX,
          startY,
          controlX,
          controlY,
          endX,
          endY,
          startAt: now + stagger,
          durationMs: 720 + Math.round(Math.random() * 320),
          radius: 6 + Math.random() * 5.5,
          spin: (Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.4),
        } satisfies CoinParticle;
      });

      particlesRef.current = [...particlesRef.current, ...burst];
      startLoop();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("tp:coin-flight", onCoinFlight as EventListener);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("tp:coin-flight", onCoinFlight as EventListener);
      particlesRef.current = [];
      stopLoop();
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[120]" aria-hidden="true" />;
}

