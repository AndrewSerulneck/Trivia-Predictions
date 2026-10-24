"use client";

import { useEffect, useId, useState } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import {
  enablePush,
  isPushAvailable,
  isPushOptedIn,
  loadPushPreferences,
  PUSH_ENABLED_EVENT,
  readPushPermission,
  setPushPreference,
} from "@/lib/nativePush";
import { PUSH_CATEGORIES, PUSH_COPY, type PushCategory, type PushPreferences } from "@/lib/pushCategories";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

// The Notifications row of the player menu (docs/native-app-store-plan.md Phase 5.1): this phone's four
// switches (group games starting, prizes, results, news from your bars), or a Turn on button. App only, and only in a build
// with the push plugin — the website and older app builds render nothing. Words live in PUSH_COPY.

type Status = "loading" | "off" | "blocked" | "on";

export const PushNotificationSettings = () => {
  const isApp = useIsNativeApp();
  const titleId = useId();
  // isApp is false on the server and during hydration, so this never mismatches the server markup.
  const available = isApp && isPushAvailable();
  const [status, setStatus] = useState<Status>("loading");
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [busy, setBusy] = useState<PushCategory | "enable" | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void (async () => {
      const saved = isPushOptedIn() ? await loadPushPreferences() : null;
      if (cancelled) return;
      if (saved) {
        setPreferences(saved);
        setStatus("on");
        return;
      }
      const permission = await readPushPermission();
      if (!cancelled) setStatus(permission === "denied" ? "blocked" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, [available]);

  // Turned on elsewhere in this visit (the welcome or the Venue Home card): show the switches.
  useEffect(() => {
    if (!available) return;
    const onEnabled = (event: Event) => {
      const saved = (event as CustomEvent<PushPreferences>).detail;
      if (!saved) return;
      setPreferences(saved);
      setStatus("on");
    };
    window.addEventListener(PUSH_ENABLED_EVENT, onEnabled);
    return () => window.removeEventListener(PUSH_ENABLED_EVENT, onEnabled);
  }, [available]);

  if (!available) return null;

  const turnOn = async () => {
    setBusy("enable");
    setFailed(false);
    const result = await enablePush();
    setBusy(null);
    if (result.ok) {
      setPreferences(result.preferences);
      setStatus("on");
    } else if (result.reason === "denied") {
      setStatus("blocked");
    } else {
      setFailed(true);
    }
  };

  const toggle = async (category: PushCategory) => {
    if (!preferences || busy) return;
    setBusy(category);
    setFailed(false);
    const saved = await setPushPreference(category, !preferences[category]);
    setBusy(null);
    if (saved) setPreferences(saved);
    else setFailed(true);
  };

  return (
    <div>
      <div id={titleId} className="text-footnote font-black uppercase tracking-[0.08em] text-ht-fg-muted">
        {PUSH_COPY.settingsTitle}
      </div>
      {status === "on" && preferences ? (
        <ul aria-labelledby={titleId} className="mt-2 space-y-1">
          {PUSH_CATEGORIES.map((category) => {
            const on = preferences[category];
            return (
              <li key={category}>
                {/* A whole-row switch. No tp-clean-button and `!border-0`: the global dark button rules
                    would draw a box around every row (app/globals.css, "light-surface scoped"). */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => void toggle(category)}
                  disabled={busy !== null}
                  className="tp-player-hit-target flex w-full items-center justify-between gap-3 !rounded-none !border-0 !bg-transparent !px-0 py-1.5 text-left disabled:opacity-70"
                >
                  <span className="text-base font-bold text-ht-fg-secondary">{PUSH_COPY.labels[category]}</span>
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors motion-reduce:transition-none ${
                      on ? "bg-ht-accent" : "bg-ht-tab-idle"
                    }`}
                  >
                    {busy === category ? (
                      <span className="mx-auto">
                        <ButtonSpinner />
                      </span>
                    ) : (
                      <span
                        className={`h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
                          on ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {status === "off" ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm leading-snug text-ht-fg-muted">{PUSH_COPY.settingsOff}</p>
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={busy !== null}
            aria-busy={busy === "enable"}
            className="tp-clean-button tp-player-hit-target tp-player-pressable shrink-0 rounded-full bg-ht-accent px-4 py-2 text-footnote font-black text-ht-on-fill disabled:opacity-60"
          >
            {busy === "enable" ? <ButtonSpinner /> : PUSH_COPY.settingsTurnOn}
          </button>
        </div>
      ) : null}
      {status === "blocked" ? <p className="mt-2 text-sm leading-snug text-ht-fg-muted">{PUSH_COPY.settingsBlocked}</p> : null}
      {failed ? <p className="mt-1 text-sm text-ht-danger-fg">{PUSH_COPY.settingsFailed}</p> : null}
    </div>
  );
};
