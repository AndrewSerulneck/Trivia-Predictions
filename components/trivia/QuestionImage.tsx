"use client";

import { useState } from "react";

export function QuestionImage({ src, credit }: { src: string; credit?: string }) {
  const [loaded, setLoaded] = useState(false);
  const isMap = src.includes("/maps/") || src.includes("wikimedia.org");
  const displayCredit =
    credit ?? (src.includes("/maps/") ? "Map: Natural Earth / U.S. Census" : undefined);
  return (
    <div className="relative z-10 mb-3">
      {!loaded ? (
        <div className="h-44 w-full animate-pulse rounded-xl bg-white/10" />
      ) : null}
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`w-full rounded-xl transition-opacity duration-300 ${isMap ? "object-contain bg-white/5" : "object-cover"} ${loaded ? "opacity-100" : "opacity-0 absolute inset-0"}`}
        style={{ maxHeight: isMap ? "248px" : "176px" }}
      />
      {displayCredit && loaded ? (
        <p className="mt-1 text-right text-[9px] text-white/30">{displayCredit}</p>
      ) : null}
    </div>
  );
}
