"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { formatCouponClock, formatCouponDate, msUntilNextSecond } from "@/lib/liveCouponClock";

/**
 * The "live" coupon (docs/reward-live-redemption-plan.md Phase 2).
 *
 * A web page can't block screenshots, so instead the coupon proves it is live: a shimmering
 * band that never stops, a ticking clock + date (a screenshot is frozen and wrong), the guest's
 * name and the venue's name (a forwarded coupon shows someone else's), and a tap that bursts
 * with sparkles (a recording can't react). Staff are told to tap it.
 *
 * Wraps the coupon only while it is shown to staff (`RedeemModal`); the wallet list stays calm.
 * Motion is CSS keyframes from `tailwind.config.ts` (transform/opacity only). Reduce Motion drops
 * the band and the sparkle travel — the clock still ticks and a tap still flashes the border,
 * because a ticking clock is the proof, not decoration.
 *
 * No requests: the server's time arrives once, with the wallet, as `clockOffsetMs`.
 */

const SPARK_MS = 700;

// Ten dots on a ring. Each class sets the direction `coupon-spark` travels; they are written out
// in full so Tailwind sees them (never built from a template string).
const SPARKS: ReadonlyArray<{ direction: string; color: string }> = [
  { direction: "[--sx:84px] [--sy:0px]", color: "bg-amber-300" },
  { direction: "[--sx:68px] [--sy:49px]", color: "bg-fuchsia-300" },
  { direction: "[--sx:26px] [--sy:80px]", color: "bg-cyan-300" },
  { direction: "[--sx:-26px] [--sy:80px]", color: "bg-amber-300" },
  { direction: "[--sx:-68px] [--sy:49px]", color: "bg-fuchsia-300" },
  { direction: "[--sx:-84px] [--sy:0px]", color: "bg-cyan-300" },
  { direction: "[--sx:-68px] [--sy:-49px]", color: "bg-amber-300" },
  { direction: "[--sx:-26px] [--sy:-80px]", color: "bg-fuchsia-300" },
  { direction: "[--sx:26px] [--sy:-80px]", color: "bg-cyan-300" },
  { direction: "[--sx:68px] [--sy:-49px]", color: "bg-amber-300" },
];

type WakeLockHandle = { release: () => Promise<void> };
type WakeLockSource = { request: (type: "screen") => Promise<WakeLockHandle> };

/** Keep the screen on while the coupon is up. Feature-detected; any failure is ignored. */
const useScreenWakeLock = (): void => {
  useEffect(() => {
    let cancelled = false;
    let handle: WakeLockHandle | null = null;

    const release = () => {
      const held = handle;
      handle = null;
      if (!held) return;
      try {
        void held.release().catch(() => undefined);
      } catch {
        // Already released (the browser drops it when the page is hidden).
      }
    };

    const acquire = async () => {
      const source = (navigator as { wakeLock?: WakeLockSource }).wakeLock;
      if (!source || document.visibilityState !== "visible") return;
      try {
        const next = await source.request("screen");
        // Unmounted, or an overlapping acquire (a quick app switch) already holds one: keep
        // a single lock so unmount's release() can't leak the other.
        if (cancelled || handle) {
          void next.release().catch(() => undefined);
          return;
        }
        handle = next;
      } catch {
        // Denied (low battery, unsupported context) — the coupon works without it.
      }
    };

    // The browser drops the lock whenever the page is hidden, so take it again on return.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      release();
      void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, []);
};

/** The corrected (server-based) time, re-rendered exactly once per second. */
const useCorrectedNow = (clockOffsetMs: number): number => {
  const [nowMs, setNowMs] = useState(() => Date.now() + clockOffsetMs);

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const corrected = Date.now() + clockOffsetMs;
      setNowMs(corrected);
      timer = window.setTimeout(tick, msUntilNextSecond(corrected));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [clockOffsetMs]);

  return nowMs;
};

type LiveCouponFrameProps = {
  children: ReactNode;
  /** Server time minus this phone's time (ms); 0 when the server's time is unknown. */
  clockOffsetMs: number;
  username: string | null;
  venueName: string | null;
};

export const LiveCouponFrame = ({ children, clockOffsetMs, username, venueName }: LiveCouponFrameProps) => {
  const nowMs = useCorrectedNow(clockOffsetMs);
  const [burstKey, setBurstKey] = useState(0);
  const pressesRef = useRef(0);
  const burstTimerRef = useRef(0);

  useScreenWakeLock();

  useEffect(() => () => window.clearTimeout(burstTimerRef.current), []);

  const handlePress = () => {
    haptic("selection");
    pressesRef.current += 1;
    setBurstKey(pressesRef.current);
    window.clearTimeout(burstTimerRef.current);
    burstTimerRef.current = window.setTimeout(() => setBurstKey(0), SPARK_MS);
  };

  const holder = [username, venueName].filter((part): part is string => Boolean(part));

  return (
    <div
      role="group"
      aria-label="Live coupon"
      data-live-coupon
      onPointerDown={handlePress}
      className="relative select-none overflow-hidden rounded-2xl [-webkit-tap-highlight-color:transparent]"
    >
      {children}

      <div className="mt-2 rounded-2xl border border-ht-border-hairline bg-ht-elevated px-4 py-3 text-center">
        <p role="timer" data-live-coupon-clock className="font-mono text-3xl font-black tabular-nums text-ht-fg-primary">
          {formatCouponClock(nowMs)}
        </p>
        <p data-live-coupon-date className="text-xs font-semibold uppercase tracking-[0.12em] text-ht-fg-muted">
          {formatCouponDate(nowMs)}
        </p>
        {holder.length > 0 ? (
          <p data-live-coupon-holder className="mt-2 text-sm font-semibold text-ht-fg-secondary">
            {holder.join(" · ")}
          </p>
        ) : null}
        <p className="mt-2 text-caption leading-snug text-ht-fg-muted">
          Staff: tap the coupon — it should sparkle, and the clock should match the time now.
        </p>
      </div>

      {/* Never stops moving. Each band is decorative and ignores touches. */}
      <div
        aria-hidden="true"
        data-live-coupon-band
        className="pointer-events-none absolute inset-y-0 left-0 w-1/4 animate-coupon-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:hidden"
      />
      <div
        aria-hidden="true"
        data-live-coupon-band
        className="pointer-events-none absolute inset-y-0 left-0 w-1/6 animate-coupon-shimmer bg-gradient-to-r from-transparent via-fuchsia-300/20 to-transparent [animation-delay:-1.3s] motion-reduce:hidden"
      />

      {burstKey > 0 ? (
        <div key={burstKey} aria-hidden="true" data-live-coupon-burst className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 animate-coupon-flash rounded-2xl border-4 border-white" />
          <div className="motion-reduce:hidden">
            {SPARKS.map((spark) => (
              <span
                key={spark.direction}
                className={`absolute left-1/2 top-[38%] -ml-1 -mt-1 h-2 w-2 animate-coupon-spark rounded-full ${spark.color} ${spark.direction}`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
