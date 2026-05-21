"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  legalNotice: string;
};

export function AppShell({ children, legalNotice }: AppShellProps) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    if (isAdmin) {
      html.classList.add("tp-admin-theme");
      body.classList.add("tp-admin-theme");
    } else {
      html.classList.remove("tp-admin-theme");
      body.classList.remove("tp-admin-theme");
    }

    return () => {
      html.classList.remove("tp-admin-theme");
      body.classList.remove("tp-admin-theme");
    };
  }, [isAdmin]);

  return (
    <div
      className={`tp-app-shell relative w-full ${
        isAdmin
          ? "fixed inset-0 h-screen w-screen max-w-full p-0 m-0 gap-0 overflow-hidden"
          : "mx-auto grid min-h-[100svh] max-w-[720px] box-border grid-rows-[1fr_auto] gap-4 overflow-x-hidden overflow-y-visible px-2 pb-24 sm:px-3"
      }`}
      style={isAdmin ? undefined : { minHeight: "var(--tp-vh, 100svh)" }}
    >
      {!isAdmin ? (
        <>
          <div className="pointer-events-none absolute -top-20 right-0 h-52 w-52 rounded-full bg-orange-300/40 blur-3xl" />
          <div className="pointer-events-none absolute top-24 left-0 h-44 w-44 rounded-full bg-red-300/30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-16 right-4 h-36 w-36 rounded-full bg-amber-200/35 blur-3xl" />
        </>
      ) : null}

      <Suspense fallback={null}>
        <main className={isAdmin ? "h-full min-h-0" : "min-h-0"}>{children}</main>
      </Suspense>
      {!isAdmin ? (
        <footer className="tp-comic-card tp-legal-card relative z-10 px-3 py-2 text-center text-xs leading-relaxed text-slate-700 break-words">
          {legalNotice}
        </footer>
      ) : null}
    </div>
  );
}
