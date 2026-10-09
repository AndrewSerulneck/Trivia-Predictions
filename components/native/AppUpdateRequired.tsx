"use client";

import { nativePlatform } from "@/lib/nativeApp";

// "Please update Hightop Challenge" — shown over everything when this copy of
// the app is older than NATIVE_APP_MIN_VERSION (components/native/NativeAppRuntimeImpl.tsx).
// Deliberately not dismissible: it only appears when the live site can no
// longer work in this version. The website stays a way to play (plan §2 item 9),
// so the screen says so. The store link is a plain link; the shell opens
// apps.apple.com / play.google.com outside the app on its own.

const LOGO_SRC = "/brand/web/htc-logo-192.webp";

export const AppUpdateRequired = ({ storeUrl }: { storeUrl: string | null }) => {
  const storeName = nativePlatform() === "android" ? "Google Play" : "the App Store";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      aria-describedby="app-update-body"
      className="fixed inset-0 z-[2147483000] flex flex-col items-center justify-center bg-slate-950 px-6 text-center"
    >
      <img src={LOGO_SRC} alt="" width={96} height={96} className="h-24 w-24 select-none" draggable={false} />
      <h1
        id="app-update-title"
        className="mt-6 text-2xl font-black text-white [font-family:var(--ht-font-display)]"
      >
        Please update Hightop Challenge
      </h1>
      <p id="app-update-body" className="mt-3 max-w-sm text-base font-semibold text-slate-300">
        This version of the app is too old to keep up with the games. Update it from {storeName} to keep playing.
      </p>
      {storeUrl ? (
        <a
          href={storeUrl}
          className="mt-8 inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-cyan-400 px-5 text-base font-black text-slate-950 active:translate-y-px"
        >
          Update now
        </a>
      ) : null}
      <p className="mt-6 max-w-sm text-sm font-semibold text-slate-400">
        You can also play in your phone&apos;s browser at play.hightopchallenge.com.
      </p>
    </div>
  );
};
