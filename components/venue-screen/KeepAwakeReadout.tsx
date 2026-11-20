"use client";

import { useKeepAwakeStatus } from "@/lib/useKeepScreenAwake";

// Support readout for `?awake=debug`: what the keep-awake hook is doing on this device.
// Never shown otherwise. Updates on hook events only.
export function KeepAwakeReadout() {
  const s = useKeepAwakeStatus();
  const rows: Array<[string, string]> = [
    ["method", s.method],
    ["wakeLockSupported", String(s.wakeLockSupported)],
    ["wakeLockHeld", String(s.wakeLockHeld)],
    ["releaseCount", String(s.releaseCount)],
    ["videoPlaying", String(s.videoPlaying)],
    ["visibility", s.visibility],
    ["sinceMs", String(s.sinceMs)],
    ["lastError", s.lastError || "-"],
    ["ua", typeof navigator === "undefined" ? "" : navigator.userAgent],
  ];
  return (
    <dl
      data-testid="keep-awake-readout"
      className="pointer-events-none fixed bottom-2 left-2 z-[100] max-w-[40rem] rounded bg-black/90 p-2 text-caption font-bold leading-snug text-white"
    >
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-ht-cyan-300">{k}</dt>
          <dd className="break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
