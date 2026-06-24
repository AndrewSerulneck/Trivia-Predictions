"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface Callout {
  /** Horizontal position of the target point, as a percentage of image width. */
  x: number;
  /** Vertical position of the target point, as a percentage of image height. */
  y: number;
  label: string;
  description: string;
}

export interface ShowcaseShot {
  src: string;
  alt: string;
  width: number;
  height: number;
  callouts: Callout[];
  /** Render the landscape "feature" layout: text on top, wide image, callouts below. */
  wide?: boolean;
  /** Heading shown above a wide shot. */
  heading?: string;
  /** Supporting copy shown above a wide shot. */
  blurb?: string;
}

export interface GameShowcase {
  name: string;
  description: string;
  shots: ShowcaseShot[];
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type AnchorSide = "left" | "right" | "bottom";

/** Measures connector lines from each callout card to its target point on the screenshot. */
const useConnectors = (
  rowRef: RefObject<HTMLDivElement | null>,
  frameRef: RefObject<HTMLDivElement | null>,
  cardRefs: RefObject<(HTMLDivElement | null)[]>,
  callouts: Callout[],
  side: AnchorSide
) => {
  const [lines, setLines] = useState<Line[]>([]);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const row = rowRef.current;
    const frame = frameRef.current;
    if (!row || !frame) return;

    // Connector lines only make sense in the wide desktop layout.
    if (window.innerWidth < 1024) {
      setLines([]);
      return;
    }

    const rb = row.getBoundingClientRect();
    const fb = frame.getBoundingClientRect();
    setBox({ w: rb.width, h: rb.height });

    const next: Line[] = [];
    callouts.forEach((c, i) => {
      const card = cardRefs.current?.[i];
      if (!card) return;
      const cb = card.getBoundingClientRect();
      const targetX = fb.left - rb.left + (c.x / 100) * fb.width;
      const targetY = fb.top - rb.top + (c.y / 100) * fb.height;

      let anchorX: number;
      let anchorY: number;
      if (side === "right") {
        anchorX = cb.left - rb.left;
        anchorY = cb.top - rb.top + cb.height / 2;
      } else if (side === "left") {
        anchorX = cb.right - rb.left;
        anchorY = cb.top - rb.top + cb.height / 2;
      } else {
        anchorX = cb.left - rb.left + cb.width / 2;
        anchorY = cb.top - rb.top;
      }
      next.push({ x1: anchorX, y1: anchorY, x2: targetX, y2: targetY });
    });
    setLines(next);
  }, [rowRef, frameRef, cardRefs, callouts, side]);

  useEffect(() => {
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    if (rowRef.current) ro.observe(rowRef.current);
    if (frameRef.current) ro.observe(frameRef.current);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, rowRef, frameRef]);

  return { lines, box, measure };
};

const ConnectorSvg = ({ lines, box }: { lines: Line[]; box: { w: number; h: number } }) => (
  <svg className="pointer-events-none absolute inset-0 hidden lg:block" width={box.w} height={box.h}>
    {lines.map((l, i) => (
      <g key={i}>
        <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#22d3ee" strokeWidth={1.5} strokeOpacity={0.65} />
        <circle cx={l.x2} cy={l.y2} r={4} fill="#22d3ee" />
      </g>
    ))}
  </svg>
);

const CalloutCard = ({ n, label, description }: { n: number; label: string; description: string }) => (
  <>
    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cyan-400 text-xs font-black text-slate-950">
      {n}
    </span>
    <div>
      <h4 className="mb-1 text-sm font-black text-white">{label}</h4>
      <p className="text-sm leading-relaxed text-slate-400">{description}</p>
    </div>
  </>
);

const orderClass = (side: "left" | "right") => (side === "left" ? "lg:order-1" : "lg:order-3");

interface ShotRowProps {
  shot: ShowcaseShot;
  /** Which side the callout cards sit on (description takes the opposite side). */
  calloutsSide: "left" | "right";
  descriptionSide: "left" | "right";
  heading?: string;
  description?: string;
}

/** Portrait screenshot: description column, centered phone, callout column with connector lines. */
const ShotRow = ({ shot, calloutsSide, descriptionSide, heading, description }: ShotRowProps) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Sort callouts top-to-bottom so the stacked cards line up with their targets.
  const callouts = [...shot.callouts].sort((a, b) => a.y - b.y);
  const { lines, box } = useConnectors(rowRef, frameRef, cardRefs, callouts, calloutsSide);

  const hasText = Boolean(heading || description);

  const descBlock = hasText ? (
    <div className={`order-1 flex-1 ${orderClass(descriptionSide)}`}>
      {heading && <h3 className="mb-3 text-2xl font-black text-white">{heading}</h3>}
      {description && <p className="text-base leading-relaxed text-slate-400">{description}</p>}
    </div>
  ) : (
    <div className={`hidden flex-1 lg:block ${orderClass(descriptionSide)}`} aria-hidden />
  );

  return (
    <div ref={rowRef} className="htm-reveal relative flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-6" data-reveal>
      {descBlock}

      <div ref={frameRef} className="order-2 mx-auto w-full max-w-[280px] flex-shrink-0 lg:order-2">
        <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-black shadow-2xl">
          <Image
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            className="block h-auto w-full"
          />
        </div>
      </div>

      <div className={`order-3 flex flex-1 flex-col gap-3 ${orderClass(calloutsSide)}`}>
        {callouts.map((c, i) => (
          <div
            key={c.label}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="htm-card-hover flex items-start gap-3 rounded-xl border border-white/8 bg-white/5 p-4"
          >
            <CalloutCard n={i + 1} label={c.label} description={c.description} />
          </div>
        ))}
      </div>

      <ConnectorSvg lines={lines} box={box} />
    </div>
  );
};

/** Landscape feature shot: heading on top, wide image, callouts in a row below with upward lines. */
const WideShotRow = ({ shot }: { shot: ShowcaseShot }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Sort left-to-right so the bottom row of cards lines up with their targets.
  const callouts = [...shot.callouts].sort((a, b) => a.x - b.x);
  const { lines, box } = useConnectors(rowRef, frameRef, cardRefs, callouts, "bottom");

  return (
    <div ref={rowRef} className="htm-reveal relative flex flex-col gap-8" data-reveal>
      {(shot.heading || shot.blurb) && (
        <div className="mx-auto max-w-2xl text-center">
          {shot.heading && <h3 className="mb-3 text-2xl font-black text-white">{shot.heading}</h3>}
          {shot.blurb && <p className="text-base leading-relaxed text-slate-400">{shot.blurb}</p>}
        </div>
      )}

      <div ref={frameRef} className="mx-auto w-full max-w-4xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-black shadow-2xl">
          <Image
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            className="block h-auto w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {callouts.map((c, i) => (
          <div
            key={c.label}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="htm-card-hover flex items-start gap-3 rounded-xl border border-white/8 bg-white/5 p-4"
          >
            <CalloutCard n={i + 1} label={c.label} description={c.description} />
          </div>
        ))}
      </div>

      <ConnectorSvg lines={lines} box={box} />
    </div>
  );
};

interface GameShowcaseBlockProps {
  game: GameShowcase;
  descriptionSide: "left" | "right";
  id?: string;
}

export const GameShowcaseBlock = ({ game, descriptionSide, id }: GameShowcaseBlockProps) => {
  const calloutsSide = descriptionSide === "left" ? "right" : "left";
  return (
    <div id={id} className="flex flex-col gap-14">
      {game.shots.map((shot, i) =>
        shot.wide ? (
          <WideShotRow key={shot.src} shot={shot} />
        ) : (
          <ShotRow
            key={shot.src}
            shot={shot}
            calloutsSide={calloutsSide}
            descriptionSide={descriptionSide}
            heading={i === 0 ? game.name : undefined}
            description={i === 0 ? game.description : undefined}
          />
        )
      )}
    </div>
  );
};
