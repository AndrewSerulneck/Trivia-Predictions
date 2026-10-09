"use client";

import { ExternalLink } from "lucide-react";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { marketingUrl } from "@/lib/domainSplit";
import { openInSystemBrowser } from "@/lib/nativeApp";
import { APP_WEB_ONLY_PAGES, webOnlyPageFor, type WebOnlyPagePath } from "@/lib/nativeLinkOut";

// What the app shows in place of a web-only page (app/in-app-notice/[page]/page.tsx,
// reached through proxy.ts's rewrite). "Open in browser" opens the page the
// player actually tried (the URL bar still holds it after the rewrite) on the
// website. The link itself is the fallback: every web-only path is in the
// shell's link-out list, so a plain full-page load to the apex leaves the app on
// any app version.

/** The website URL to open: the page that was asked for, or the entry's own page. */
const targetUrl = (path: WebOnlyPagePath): string => {
  const fallback = marketingUrl(APP_WEB_ONLY_PAGES[path].openPath);
  if (typeof window === "undefined") return fallback;
  const { pathname, search } = window.location;
  return webOnlyPageFor(pathname) === path ? marketingUrl(`${pathname}${search}`) : fallback;
};

export const WebOnlyNotice = ({ path }: { path: WebOnlyPagePath }) => {
  const { title, body, openPath } = APP_WEB_ONLY_PAGES[path];

  return (
    <OwnerShell title={title} variant="dark" backTo={{ home: true, label: "Back" }}>
      <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-6 text-center shadow-ht-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ht-elevated">
          <ExternalLink aria-hidden="true" className="h-6 w-6 text-ht-cyan-300" />
        </div>
        <p className="mt-4 text-sm font-semibold text-ht-muted">{body}</p>
        <a
          href={marketingUrl(openPath)}
          onClick={(event) => {
            event.preventDefault();
            const url = targetUrl(path);
            void openInSystemBrowser(url).then((opened) => {
              if (!opened) window.location.assign(url);
            });
          }}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-ht-cyan-500 px-4 font-black text-slate-950 shadow-ht-glow-cyan transition active:translate-y-px"
        >
          Open in browser
        </a>
      </div>
    </OwnerShell>
  );
};
