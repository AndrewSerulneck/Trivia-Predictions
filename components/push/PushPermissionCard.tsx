"use client";

import { useEffect, useState } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { haptic } from "@/lib/haptics";
import { dismissPushAsk, enablePush, shouldAskForPush } from "@/lib/nativePush";
import { PUSH_COPY } from "@/lib/pushCategories";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

// "Get a heads-up?" — the app's one push permission ask (docs/native-app-store-plan.md Phase 5.1).
// Never at launch: Venue Home shows it only once the player has points at this venue (`eligible`), i.e.
// after their first game. App only — the website renders nothing and runs nothing. "Not now" snoozes it
// for 30 days; the account menu's Notifications row can turn push on any time.
export const PushPermissionCard = ({ eligible }: { eligible: boolean }) => {
  const isApp = useIsNativeApp();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isApp || !eligible) return;
    let cancelled = false;
    void shouldAskForPush().then((ask) => {
      if (!cancelled) setVisible(ask);
    });
    return () => {
      cancelled = true;
    };
  }, [isApp, eligible]);

  if (!visible) return null;

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      haptic("success");
      setVisible(false);
      return;
    }
    if (result.reason === "denied") {
      // The phone said no: don't keep asking. The account menu explains how to change it.
      dismissPushAsk();
      setVisible(false);
      return;
    }
    setFailed(true);
  };

  const decline = () => {
    dismissPushAsk();
    setVisible(false);
  };

  return (
    <section
      aria-label={PUSH_COPY.askTitle}
      className="mb-3 rounded-ht-lg border border-ht-border-hairline bg-ht-elevated/60 px-4 py-3"
    >
      <p className="text-base font-black text-ht-fg-primary">{PUSH_COPY.askTitle}</p>
      <p className="mt-1 text-sm leading-snug text-ht-fg-secondary">{PUSH_COPY.askBody}</p>
      {failed ? <p className="mt-1 text-sm text-ht-danger-fg">{PUSH_COPY.settingsFailed}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void accept()}
          disabled={busy}
          aria-busy={busy}
          className="tp-clean-button tp-player-hit-target tp-player-pressable rounded-full bg-ht-accent px-4 py-2 text-footnote font-black text-ht-on-fill disabled:opacity-60"
        >
          {busy ? <ButtonSpinner /> : PUSH_COPY.askAccept}
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={busy}
          className="tp-clean-button tp-player-hit-target tp-player-pressable rounded-full bg-ht-tab-idle px-4 py-2 text-footnote font-black text-ht-fg-secondary disabled:opacity-60"
        >
          {PUSH_COPY.askDecline}
        </button>
      </div>
    </section>
  );
};
