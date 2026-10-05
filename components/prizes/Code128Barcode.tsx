"use client";

import { useMemo } from "react";
import { code128Modules } from "@/lib/pos/code128";

// A Code 128 barcode as inline SVG (docs/pos-rewards-integration-plan.md Phase 2): black bars
// on white with a 10-module quiet zone each side, so a register's barcode scanner can read it
// off a phone screen. Pure rendering — lib/pos/code128.ts does the encoding.

const QUIET_MODULES = 10;
const HEIGHT = 40;

export const Code128Barcode = ({ value, label }: { value: string; label: string }) => {
  const { bars, width } = useMemo(() => {
    const modules = code128Modules(value);
    let x = QUIET_MODULES;
    const list: Array<{ x: number; w: number }> = [];
    modules.forEach((w, index) => {
      if (index % 2 === 0) list.push({ x, w });
      x += w;
    });
    return { bars: list, width: x + QUIET_MODULES };
  }, [value]);

  return (
    <div className="rounded-lg bg-white p-2">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        role="img"
        aria-label={label}
        className="block h-16 w-full fill-black"
      >
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.w} height={HEIGHT} />
        ))}
      </svg>
    </div>
  );
};
