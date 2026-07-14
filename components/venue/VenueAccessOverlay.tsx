"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LocateFixed, LogOut, MapPin, RefreshCw, ShieldAlert } from "lucide-react";
import {
  type VenueAccessOverlayContent,
  type VenueAccessOverlayKind,
  venuePresenceKindLabel,
} from "@/lib/venuePresenceClient";

function OverlayGlyph({ kind }: { kind: VenueAccessOverlayKind }) {
  const Icon = kind === "signed_out" ? LogOut : kind === "location_off" ? LocateFixed : kind === "rejoin_required" ? ShieldAlert : MapPin;

  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full border border-cyan-300/40"
        animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.5, 0.95, 0.5] }}
        transition={{ duration: 2.8, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-[10%] rounded-full border border-amber-300/35"
        animate={{ scale: [1, 1.14, 1], opacity: [0.22, 0.62, 0.22] }}
        transition={{ duration: 2.2, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY, delay: 0.2 }}
      />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_30%_30%,rgba(103,232,249,0.34),rgba(15,23,42,0.92)_70%)] shadow-[0_24px_60px_rgba(8,145,178,0.28)]">
        <Icon className="h-10 w-10 text-cyan-100" strokeWidth={2.3} />
      </div>
    </div>
  );
}

export function VenueAccessOverlay({
  content,
  isBusy = false,
  showSecondaryAction = true,
  onPrimaryAction,
  onSecondaryAction,
}: {
  content: VenueAccessOverlayContent | null;
  isBusy?: boolean;
  showSecondaryAction?: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
}) {
  return (
    <AnimatePresence>
      {content ? (
        <motion.div
          key={content.kind}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-[140] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),rgba(2,6,23,0.94)_42%,rgba(2,6,23,0.98)_100%)] px-4 py-6 backdrop-blur-md"
        >
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(8,47,73,0.96),rgba(3,7,18,0.98))] p-6 text-white shadow-[0_32px_100px_rgba(2,6,23,0.58)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="venue-access-overlay-title"
            aria-describedby="venue-access-overlay-body"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-20 top-0 h-40 w-40 rounded-full bg-cyan-400/14 blur-3xl" />
              <div className="absolute -right-20 bottom-0 h-44 w-44 rounded-full bg-amber-300/12 blur-3xl" />
            </div>

            <div className="relative flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100/90">
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.85)]" />
                {venuePresenceKindLabel(content.kind)}
              </div>

              <div className="mt-5">
                <OverlayGlyph kind={content.kind} />
              </div>

              <h2 id="venue-access-overlay-title" className="mt-5 text-[1.85rem] font-black leading-[1.05] tracking-[-0.02em]">
                {content.title}
              </h2>
              <p id="venue-access-overlay-body" className="mt-3 max-w-[28rem] text-sm font-medium leading-6 text-cyan-50/82">
                {content.body}
              </p>

              <div className="mt-6 grid w-full gap-3">
                <button
                  type="button"
                  onClick={onPrimaryAction}
                  disabled={isBusy}
                  className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#fde68a,#f59e0b)] px-4 py-3 text-sm font-black text-slate-950 transition-transform duration-200 active:scale-[0.99] disabled:opacity-70"
                >
                  {isBusy ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : null}
                  {content.primaryLabel}
                </button>

                {showSecondaryAction && content.secondaryLabel && onSecondaryAction ? (
                  <button
                    type="button"
                    onClick={onSecondaryAction}
                    className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border border-white/14 bg-white/[0.05] px-4 py-3 text-sm font-black text-white/92 transition-colors duration-200 hover:bg-white/[0.08]"
                  >
                    {content.secondaryLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
