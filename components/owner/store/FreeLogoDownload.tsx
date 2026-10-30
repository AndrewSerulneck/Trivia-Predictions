"use client";

import { Download } from "lucide-react";
import { BRAND_LOGO_DOWNLOAD, BRAND_LOGO_PREVIEW_SRC } from "@/lib/brandLogoDownload";

// The Hightop Challenge logo as a free transparent PNG, under the free QR code
// on the Shop step (docs/join-merch-store-plan.md), for partners' menus and
// signs. A plain same-origin <a download>; the ~1.7 MB file is fetched only on
// tap, and the preview is the 192 px WebP the app has already cached.

const LINK_CLASS =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300";

export const FreeLogoDownload = () => (
  <section
    aria-labelledby="free-logo-heading"
    data-free-logo
    className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex sm:items-center sm:gap-5"
  >
    <img
      src={BRAND_LOGO_PREVIEW_SRC}
      width={112}
      height={112}
      alt="Hightop Challenge logo"
      loading="lazy"
      decoding="async"
      className="mx-auto h-28 w-28 shrink-0 sm:mx-0"
    />
    <div className="mt-3 min-w-0 sm:mt-0">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Free</p>
      <h4 id="free-logo-heading" className="text-lg font-black leading-tight text-slate-900">
        Download our logo
      </h4>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        A transparent PNG of the Hightop Challenge logo, ready to drop onto your menus, flyers or social posts.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={BRAND_LOGO_DOWNLOAD.src}
          download={BRAND_LOGO_DOWNLOAD.download}
          className={`${LINK_CLASS} bg-indigo-600 text-white hover:bg-indigo-700`}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Download logo
        </a>
      </div>
    </div>
  </section>
);
