"use client";

import { useEffect, useId, useState } from "react";
import { Clock, ListChecks, Trophy, type LucideIcon } from "lucide-react";
import { useNativeBackHandler } from "@/components/navigation/nativeBackButton";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { haptic } from "@/lib/haptics";
import { enablePush, markPushWelcomeShown, shouldShowPushWelcome } from "@/lib/nativePush";
import { PUSH_COPY, type PushCategory } from "@/lib/pushCategories";
import { setScrollLock } from "@/lib/scrollLock";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

// The app's FIRST push ask (docs/native-app-store-plan.md Phase 5.3, Andrew: "our screen first"): one full
// screen of our own on Venue Home, once per phone, right after the first sign-in in the app. The phone's
// own prompt appears only when the player taps "Turn on"; "Not now" leaves it unasked, so the Venue Home
// card (`PushPermissionCard`) can ask later. While this is due, and for the rest of the visit it shows in,
// popup ads wait (`pushWelcomeHoldsPopupAds`). App only — the website renders nothing and runs nothing.

const BENEFITS: { category: PushCategory; Icon: LucideIcon }[] = [
  { category: "prizes", Icon: Trophy },
  { category: "results", Icon: ListChecks },
  { category: "games", Icon: Clock },
];

export const PushWelcomeScreen = ({ ready }: { ready: boolean }) => {
  const isApp = useIsNativeApp();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isApp || !ready) return;
    let cancelled = false;
    void shouldShowPushWelcome().then((show) => {
      if (cancelled || !show) return;
      markPushWelcomeShown();
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isApp, ready]);

  useEffect(() => {
    setScrollLock("push-welcome", open);
    return () => setScrollLock("push-welcome", false);
  }, [open]);

  const close = () => setOpen(false);

  // Android's Back inside the app = "Not now".
  useNativeBackHandler("overlay", open && !busy ? close : null);

  if (!open) return null;

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      haptic("success");
      close();
      return;
    }
    // The phone said no: close. The card won't ask again; the menu explains how to change it.
    if (result.reason === "denied") {
      close();
      return;
    }
    setFailed(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-tp-scroll-lock="active"
      className="fixed inset-0 z-[2300] flex flex-col bg-ht-canvas animate-tp-fade-in"
    >
      <div className="mx-auto flex h-full w-full max-w-[24rem] flex-col px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-10">
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
          <img src="/brand/web/htc-logo-192.webp" alt="" width={72} height={72} className="mb-6 h-[72px] w-[72px]" />
          <h1
            id={titleId}
            className="text-[1.75rem] leading-tight text-ht-fg-primary [font-family:var(--ht-font-display)]"
          >
            {PUSH_COPY.welcomeTitle}
          </h1>
          <ul className="mt-6 space-y-4">
            {BENEFITS.map(({ category, Icon }) => (
              <li key={category} className="flex items-start gap-3">
                <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ht-accent" />
                <span className="text-base leading-snug text-ht-fg-secondary">{PUSH_COPY.welcomeBenefits[category]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-6">
          {failed ? (
            <p role="alert" className="mb-3 text-center text-sm text-ht-danger-fg">
              {PUSH_COPY.settingsFailed}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void accept()}
            disabled={busy}
            aria-busy={busy}
            className="tp-clean-button tp-player-hit-target tp-player-pressable flex w-full items-center justify-center rounded-full bg-ht-accent px-4 py-3 text-base font-black text-ht-on-fill disabled:opacity-60"
          >
            {busy ? <ButtonSpinner /> : PUSH_COPY.askAccept}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="tp-player-hit-target tp-player-pressable mt-2 flex w-full items-center justify-center !rounded-none !border-0 !bg-transparent px-4 py-3 text-base font-bold text-ht-fg-secondary disabled:opacity-60"
          >
            {PUSH_COPY.askDecline}
          </button>
          <p className="mt-2 text-center text-footnote text-ht-fg-muted">{PUSH_COPY.welcomeFootnote}</p>
        </div>
      </div>
    </div>
  );
};
