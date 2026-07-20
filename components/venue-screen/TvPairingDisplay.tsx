"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SCREEN_COLORS, SCREEN_EASE as EASE } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvPairingDisplay />  — the /tv screen before a venue is linked.
 *
 * Phase comes from the parent poll. Each phase plays its entrance once,
 * keyed on `phase + code`, so a reissued code re-animates and a repeated
 * poll does nothing.
 *
 * NOTE ON THE QR: this component does not encode the QR itself. Pass a
 * `qrMatrix` (true = dark module) or a `renderQr` callback. See the note
 * at the bottom of the file for why, and for the one-line wiring — this
 * project wires it via `qrcode.react`'s `QRCodeSVG` in app/tv/page.tsx.
 *
 * Authored via Claude Web UI (Prompt G), integrated into the venue screen.
 * No changes needed for this project's hooks lint (fully prop-driven,
 * no local clock) — only brand-token substitution.
 * ------------------------------------------------------------------ */

export type PairingPhase = "pending" | "claimed" | "expired";

export type TvPairingDisplayProps = {
  code: string;
  qrValue: string;
  phase: PairingPhase;
  /** Square matrix of modules; true = dark. Quiet zone is added here. */
  qrMatrix?: boolean[][];
  /** Alternative to qrMatrix: render your own QR at the given pixel size. */
  renderQr?: (sizePx: number) => ReactNode;
  /** Shown under the QR as a typo-able fallback. */
  manualUrl?: string;
};

const BRAND = {
  cyan: SCREEN_COLORS.cyan500,
  cyanLight: SCREEN_COLORS.cyan400,
  blue: SCREEN_COLORS.blue600,
  violet: SCREEN_COLORS.violet600,
  emerald: "#10b981",
  emeraldLight: "#34d399",
  amber: SCREEN_COLORS.amber500,
  amberLight: SCREEN_COLORS.amber400,
  slate: "#94a3b8",
  slateDim: "#475569",
};

const QR_PX = 460;

export function TvPairingDisplay({ code, qrValue: _qrValue, phase, qrMatrix, renderQr, manualUrl }: TvPairingDisplayProps) {
  const reduceMotion = useReducedMotion();
  const chars = useMemo(() => (code ?? "").toUpperCase().split(""), [code]);
  const revealKey = `${phase}::${code}`;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ color: "#f8fafc" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 720px at 18% 8%, rgba(6,182,212,0.14), transparent 62%)," +
            "radial-gradient(900px 640px at 92% 100%, rgba(124,58,237,0.14), transparent 62%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: 10, background: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.blue} 55%, ${BRAND.violet})` }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {phase === "claimed" ? (
          <ClaimedState key={revealKey} reduceMotion={!!reduceMotion} />
        ) : (
          <motion.div
            key={revealKey}
            className="relative flex h-full items-center"
            style={{ padding: "0 110px", gap: 100 }}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {/* ---- Left: label, code, caption ---- */}
            <div className="flex-1">
              <motion.div
                className="flex items-center"
                style={{ gap: 16 }}
                initial={reduceMotion ? false : { opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.55, ease: EASE }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: phase === "expired" ? BRAND.amber : BRAND.cyanLight,
                    boxShadow: `0 0 22px ${phase === "expired" ? BRAND.amber : BRAND.cyan}`,
                  }}
                />
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    letterSpacing: "0.34em",
                    textTransform: "uppercase",
                    color: phase === "expired" ? BRAND.amberLight : BRAND.cyanLight,
                  }}
                >
                  {phase === "expired" ? "Code expired" : "Link this TV"}
                </span>
              </motion.div>

              <motion.h1
                style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.035em", marginTop: 14, maxWidth: 720 }}
                initial={reduceMotion ? false : { opacity: 0, y: 26, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.06 }}
              >
                {phase === "expired" ? "Fetching a fresh code…" : "Enter this code in the Hightop app"}
              </motion.h1>

              {/* Code tiles */}
              <div className="flex" style={{ gap: 18, marginTop: 46 }}>
                {chars.map((ch, i) => (
                  <motion.div
                    key={`${i}-${ch}`}
                    className="relative flex items-center justify-center overflow-hidden"
                    style={{
                      width: 132,
                      height: 168,
                      borderRadius: 22,
                      background: "rgba(15,23,42,0.72)",
                      border: `2px solid ${phase === "expired" ? "rgba(245,158,11,0.35)" : "rgba(34,211,238,0.34)"}`,
                      boxShadow: phase === "expired" ? "none" : "0 0 50px rgba(6,182,212,0.16), inset 0 0 40px rgba(6,182,212,0.07)",
                      opacity: phase === "expired" ? 0.45 : 1,
                    }}
                    initial={reduceMotion ? false : { opacity: 0, y: 40, scale: 0.9 }}
                    animate={{ opacity: phase === "expired" ? 0.45 : 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5, ease: EASE, delay: 0.18 + i * 0.06 }}
                  >
                    <span
                      style={{
                        fontSize: 104,
                        fontWeight: 900,
                        lineHeight: 1,
                        letterSpacing: "0.02em",
                        color: phase === "expired" ? BRAND.slate : "#f8fafc",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {ch}
                    </span>

                    {/* Subtle looping shimmer, pending only. */}
                    {phase === "pending" && !reduceMotion && (
                      <motion.div
                        className="absolute inset-y-0"
                        style={{ width: "60%", background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.22), transparent)" }}
                        animate={{ x: ["-120%", "260%"] }}
                        transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut", delay: i * 0.12 }}
                      />
                    )}
                  </motion.div>
                ))}
              </div>

              <motion.p
                style={{ marginTop: 40, fontSize: 30, fontWeight: 600, color: BRAND.slate, maxWidth: 700, lineHeight: 1.4 }}
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.6 }}
              >
                This is <strong style={{ color: "#e2e8f0", fontWeight: 800 }}>this TV&apos;s</strong> own code — it links the
                screen you&apos;re looking at, not your team.
              </motion.p>
            </div>

            {/* ---- Right: QR ---- */}
            <motion.div
              className="flex shrink-0 flex-col items-center"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: phase === "expired" ? 0.4 : 1, scale: 1 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.14 }}
            >
              {/* Light card + quiet zone. QR must be dark-on-light to scan
                  reliably; do not invert it onto the dark canvas. */}
              <div style={{ padding: 34, borderRadius: 30, background: "#ffffff", boxShadow: "0 0 90px rgba(34,211,238,0.22)" }}>
                {renderQr ? renderQr(QR_PX) : qrMatrix?.length ? <QrFromMatrix matrix={qrMatrix} size={QR_PX} /> : <QrPlaceholder size={QR_PX} />}
              </div>
              <div style={{ marginTop: 24, fontSize: 26, fontWeight: 700, color: BRAND.slate, textAlign: "center", maxWidth: QR_PX + 68 }}>
                Scan to link
                {manualUrl ? <div style={{ marginTop: 6, color: BRAND.slateDim, fontSize: 22 }}>or visit {manualUrl}</div> : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------- claimed ---------------------------- */

function ClaimedState({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      className="relative flex h-full flex-col items-center justify-center"
      style={{ gap: 44 }}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="relative" style={{ width: 300, height: 300 }}>
        {!reduceMotion &&
          [0, 1].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0"
              style={{ borderRadius: 999, border: `4px solid ${BRAND.emeraldLight}` }}
              initial={{ scale: 0.6, opacity: 0.8 }}
              animate={{ scale: 1.9 + i * 0.35, opacity: 0 }}
              transition={{ duration: 1.1 + i * 0.2, ease: "easeOut", delay: 0.16 + i * 0.12 }}
            />
          ))}

        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            borderRadius: 999,
            background: "rgba(16,185,129,0.12)",
            border: `3px solid ${BRAND.emerald}`,
            boxShadow: "0 0 90px rgba(16,185,129,0.35)",
          }}
          initial={reduceMotion ? false : { scale: 0.72, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <svg width={160} height={160} viewBox="0 0 160 160" fill="none">
            <motion.path
              d="M42 84 L68 110 L120 52"
              stroke={BRAND.emeraldLight}
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: reduceMotion ? 0 : 0.28 }}
            />
          </svg>
        </motion.div>
      </div>

      <motion.h1
        style={{ fontSize: 118, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}
        initial={reduceMotion ? false : { opacity: 0, y: 30, filter: "blur(14px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}
      >
        Linked!
      </motion.h1>

      <motion.div
        className="flex items-center"
        style={{ gap: 20 }}
        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.5 }}
      >
        <span style={{ fontSize: 42, fontWeight: 700, color: BRAND.slate }}>Loading your venue screen…</span>
        {!reduceMotion && (
          <motion.span
            style={{ width: 22, height: 22, borderRadius: 999, background: BRAND.cyanLight }}
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------ QR ------------------------------- */

function QrFromMatrix({ matrix, size }: { matrix: boolean[][]; size: number }) {
  const n = matrix.length;
  const quiet = 4; // modules; required by the spec for reliable scanning
  const total = n + quiet * 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges">
      <rect width={total} height={total} fill="#ffffff" />
      {matrix.map((row, y) =>
        row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width={1} height={1} fill="#020617" /> : null)),
      )}
    </svg>
  );
}

/** Clearly-not-a-QR stand-in so nobody tries to scan the preview. */
function QrPlaceholder({ size }: { size: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ width: size, height: size, borderRadius: 12, background: "#e2e8f0", border: "3px dashed #94a3b8", padding: 28, textAlign: "center" }}
    >
      <div style={{ fontSize: 30, fontWeight: 900, color: "#334155" }}>QR slot</div>
      <div style={{ fontSize: 19, fontWeight: 600, color: "#64748b", marginTop: 10, lineHeight: 1.35 }}>
        Pass <code>qrMatrix</code> or <code>renderQr</code> to render the real code.
      </div>
    </div>
  );
}
