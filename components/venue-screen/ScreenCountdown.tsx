type ScreenCountdownProps = {
  seconds: number;
  label?: string;
  tone?: "cyan" | "amber" | "white";
  size?: "medium" | "large";
};

export function formatScreenCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function ScreenCountdown({
  seconds,
  label = "Time",
  tone = "white",
  size = "large",
}: ScreenCountdownProps) {
  const toneClass =
    tone === "cyan" ? "text-cyan-100" : tone === "amber" ? "text-amber-200" : "text-white";
  const sizeClass = size === "large" ? "text-[clamp(5rem,9vw,10rem)]" : "text-[clamp(3rem,6vw,6rem)]";

  return (
    <div className="flex min-w-[14rem] flex-col items-end">
      <p className="text-2xl font-black uppercase tracking-[0.18em] text-white/55">{label}</p>
      <p className={`font-mono ${sizeClass} font-black leading-none tabular-nums ${toneClass}`}>
        {formatScreenCountdown(seconds)}
      </p>
    </div>
  );
}
