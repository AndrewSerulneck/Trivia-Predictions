"use client";

import { useState, useSyncExternalStore } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { haptic } from "@/lib/haptics";
import { liveTriviaCalendarPath } from "@/lib/liveTriviaCalendar";
import {
  clearGameReminder,
  findStoredReminder,
  GAME_REMINDER_COPY,
  setGameReminder,
} from "@/lib/liveTriviaReminders";
import { openInSystemBrowser } from "@/lib/nativeApp";
import { enablePush, isPushAvailable, isPushOptedIn, PUSH_ASK_INLINE_EVENT } from "@/lib/nativePush";
import { PUSH_COPY } from "@/lib/pushCategories";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

// "Remind me" + "Add to calendar" under the next Live Trivia game on Venue Home, at the bar or away
// (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C3). Neither plays anything, so neither
// asks where the player is.
//
// Remind me is app-only (a push needs the app). If push isn't on yet on this phone, the tap first shows the
// same consent words as the push card (Apple 4.5.4: what "Turn on" covers is stated before it), and the
// reminder is saved once push is on. Add to calendar is a link to the .ics (lib/liveTriviaCalendar.ts);
// the app opens it in the phone's browser, which offers to add it.

type Props = {
  venueId: string;
  scheduleId: string;
  startMs: number;
};

const PILL =
  "tp-clean-button tp-player-hit-target tp-player-pressable inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-footnote font-black disabled:opacity-60";
const PILL_IDLE = "border-ht-accent/40 bg-ht-accent/10 text-ht-accent-soft";
const PILL_ON = "border-ht-accent bg-ht-accent text-ht-on-fill";

const noSubscription = (): (() => void) => () => {};

/** Mount with `key` = the game, so a new game starts from its own stored state. Client-only (needs the game). */
export const LiveTriviaReminderRow = ({ venueId, scheduleId, startMs }: Props) => {
  const isApp = useIsNativeApp();
  const canRemind = useSyncExternalStore(noSubscription, () => isApp && isPushAvailable(), () => false);
  const [isSet, setIsSet] = useState(() => findStoredReminder(scheduleId, startMs) !== null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");

  const save = async () => {
    const outcome = await setGameReminder({ venueId, scheduleId, startMs });
    if (outcome === "set") {
      haptic("success");
      setIsSet(true);
      setMessage("");
      return;
    }
    setMessage(outcome === "changed" ? GAME_REMINDER_COPY.changed : GAME_REMINDER_COPY.failed);
  };

  const toggle = async () => {
    if (busy) return;
    setMessage("");
    if (isSet) {
      setBusy(true);
      const outcome = await clearGameReminder({ scheduleId, startMs });
      setBusy(false);
      if (outcome === "cleared") setIsSet(false);
      else setMessage(GAME_REMINDER_COPY.failed);
      return;
    }
    if (!isPushOptedIn()) {
      setAsking(true);
      window.dispatchEvent(new Event(PUSH_ASK_INLINE_EVENT));
      return;
    }
    setBusy(true);
    await save();
    setBusy(false);
  };

  const turnOnAndSave = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const result = await enablePush();
    if (result.ok) {
      setAsking(false);
      await save();
    } else {
      setMessage(result.reason === "denied" ? PUSH_COPY.settingsBlocked : PUSH_COPY.settingsFailed);
    }
    setBusy(false);
  };

  const calendarPath = liveTriviaCalendarPath(venueId, scheduleId, startMs);

  return (
    <div data-live-trivia-reminder className="mt-3 border-t border-ht-border-hairline pt-3">
      <div className="flex flex-wrap gap-2">
        {canRemind ? (
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={busy}
            aria-pressed={isSet}
            aria-busy={busy}
            className={`${PILL} ${isSet ? PILL_ON : PILL_IDLE}`}
          >
            {busy && !asking ? <ButtonSpinner /> : null}
            <span className="font-black">{isSet ? GAME_REMINDER_COPY.reminderSet : GAME_REMINDER_COPY.remind}</span>
          </button>
        ) : null}
        <a
          href={calendarPath}
          onClick={(event) => {
            if (!isApp) return;
            event.preventDefault();
            const url = `${window.location.origin}${calendarPath}`;
            // Never load the .ics inside the app's web view: an iPhone has no way back from a raw file page.
            void openInSystemBrowser(url).then((opened) => {
              if (!opened) setMessage(GAME_REMINDER_COPY.calendarFailed);
            });
          }}
          className={`${PILL} ${PILL_IDLE}`}
        >
          {GAME_REMINDER_COPY.addToCalendar}
        </a>
      </div>

      {asking ? (
        <div className="mt-3">
          <p className="text-footnote leading-snug text-ht-fg-secondary">{PUSH_COPY.askBody}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void turnOnAndSave()}
              disabled={busy}
              aria-busy={busy}
              className="tp-clean-button tp-player-hit-target tp-player-pressable rounded-full bg-ht-accent px-4 py-2 text-footnote font-black text-ht-on-fill disabled:opacity-60"
            >
              {busy ? <ButtonSpinner /> : PUSH_COPY.askAccept}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
              className="tp-clean-button tp-player-hit-target tp-player-pressable rounded-full bg-ht-tab-idle px-4 py-2 text-footnote font-black text-ht-fg-secondary disabled:opacity-60"
            >
              {PUSH_COPY.askDecline}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role="status" className="mt-2 text-footnote text-ht-danger-fg">
          {message}
        </p>
      ) : null}
    </div>
  );
};
