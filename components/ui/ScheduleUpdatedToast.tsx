"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * Small transient banner shown when a venue's game schedule just changed
 * (see lib/hooks/useScheduleUpdatedBroadcast.ts's useScheduleUpdatedFlash) —
 * makes the near-instant countdown refresh visibly obvious rather than a
 * silent number change a player might not notice.
 */
export default function ScheduleUpdatedToast({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Schedule updated
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
