"use client";

import { ExternalLink } from "lucide-react";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { marketingUrl } from "@/lib/domainSplit";
import { openInSystemBrowser } from "@/lib/nativeApp";
import { APP_WEB_ONLY_PAGES, type WebOnlyPagePath } from "@/lib/nativeLinkOut";

// What the app shows in place of a web-only page (components/native/WebOnlyInApp.tsx).
// "Open in browser" opens the same page on the website. The link itself is the
// fallback: every web-only path is in the shell's link-out list, so a plain
// full-page load to it leaves the app on any app version.

export const WebOnlyNotice = ({ path }: { path: WebOnlyPagePath }) => {
  const { title, body } = APP_WEB_ONLY_PAGES[path];
  const url = marketingUrl(path);

  return (
    <OwnerShell title={title} variant="dark" backTo={{ home: true, label: "Back" }}>
      <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-6 text-center shadow-ht-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ht-elevated">
          <ExternalLink aria-hidden="true" className="h-6 w-6 text-ht-cyan-300" />
        </div>
        <p className="mt-4 text-sm font-semibold text-ht-muted">{body}</p>
        <a
          href={url}
          onClick={(event) => {
            event.preventDefault();
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
