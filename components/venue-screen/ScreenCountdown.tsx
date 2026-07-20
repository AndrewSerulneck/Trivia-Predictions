import { SCREEN_COLORS, withAlpha } from "@/lib/venueScreenBrand";

type ScreenCountdownProps = {
  seconds: number;
  label?: string;
  tone?: "cyan" | "amber" | "fuchsia" | "white";
  size?: "medium" | "large";
  align?: "start" | "center" | "end";
};

export function formatScreenCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

const TONE_HEX: Record<NonNullable<ScreenCountdownProps["tone"]>, string> = {
  cyan: SCREEN_COLORS.cyan300,
  amber: SCREEN_COLORS.amber300,
  fuchsia: SCREEN_COLORS.fuchsia300,
  white: SCREEN_COLORS.white,
};

// Broadcast-style countdown: big tabular numerals in a tinted pill, with the
// final-seconds urgency baked in (amber under 10s, rose under 5s) so a glance
// across the room reads "time's almost up". Hook-free so it can render on the
// server; the CSS pulse in the last 5s is a pure keyframe class.
export function ScreenCountdown({
  seconds,
  label = "Time",
  tone = "white",
  size = "large",
  align = "end",
}: ScreenCountdownProps) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const urgent = safeSeconds <= 10 && safeSeconds > 5;
  const critical = safeSeconds <= 5;
  const color = critical ? SCREEN_COLORS.amber400 : urgent ? SCREEN_COLORS.amber300 : TONE_HEX[tone];
  const glow = critical ? "#f43f5e" : color;

  const sizeClass = size === "large" ? "text-[clamp(5rem,9vw,10rem)]" : "text-[clamp(3rem,6vw,6rem)]";
  const alignClass =
    align === "center" ? "items-center text-center" : align === "start" ? "items-start text-left" : "items-end text-right";

  return (
    <div className={`flex min-w-[14rem] flex-col ${alignClass}`}>
      <p className="text-2xl font-black uppercase tracking-[0.18em] text-white/55">{label}</p>
      <div
        className={`mt-2 rounded-2xl border px-6 py-2 ${critical ? "animate-tp-countdown-critical" : ""}`}
        style={{
          borderColor: withAlpha(color, 0.32),
          background: withAlpha(color, 0.1),
          boxShadow: `0 0 40px ${withAlpha(glow, critical ? 0.4 : 0.2)}`,
        }}
      >
        <p
          className={`font-mono ${sizeClass} font-black leading-none tabular-nums`}
          style={{ color, textShadow: `0 0 28px ${withAlpha(glow, 0.5)}` }}
        >
          {formatScreenCountdown(safeSeconds)}
        </p>
      </div>
    </div>
  );
}
