import { LeftHamburgerMenu } from "@/components/ui/LeftHamburgerMenu";

type PageShellProps = {
  title: string;
  description?: string;
  noContainer?: boolean;
  lockViewport?: boolean;
  showBranding?: boolean;
  showUserStatus?: boolean;
  showAlerts?: boolean;
  showPageTitle?: boolean;
  shellClassName?: string;
  mainClassName?: string;
  children?: React.ReactNode;
};

export function PageShell({
  title,
  description,
  showBranding = false,
  showUserStatus = true,
  showAlerts = true,
  showPageTitle = true,
  children,
  noContainer = false,
  lockViewport = false,
  shellClassName,
  mainClassName,
}: PageShellProps) {
  const useCompactTopNav = !showBranding;
  const hasCompactHeaderContent = showUserStatus || showPageTitle;
  const mainClass = noContainer
    ? lockViewport
      ? "min-h-0 flex-1 overflow-hidden p-0"
      : "min-h-0 flex-1 overflow-x-hidden overflow-y-visible p-0"
    : "bg-ht-surface border border-ht-border-hairline rounded-ht-2xl min-h-0 flex-1 overflow-x-hidden overflow-y-visible p-3 sm:p-4 text-base";
  const compactHeaderSpacerClass = useCompactTopNav && hasCompactHeaderContent
    ? showUserStatus
      ? showPageTitle
        ? "h-[calc(env(safe-area-inset-top)+5.35rem)] sm:h-[calc(env(safe-area-inset-top)+6.4rem)]"
        : "h-[calc(env(safe-area-inset-top)+4.35rem)] sm:h-[calc(env(safe-area-inset-top)+5.1rem)]"
      : showPageTitle
      ? "h-[calc(env(safe-area-inset-top)+2.9rem)]"
      : "h-0"
    : "h-0";
  const shellGapClass = showBranding ? "gap-0" : "gap-3";

  const shellHeightClass = lockViewport ? "h-[100svh] min-h-[100svh] max-h-[100svh] overflow-hidden" : "min-h-[100dvh] overflow-x-hidden";
  const shellStyle = lockViewport
    ? {
        height: "var(--tp-vh, 100svh)",
        minHeight: "var(--tp-vh, 100svh)",
        maxHeight: "var(--tp-vh, 100svh)",
      }
    : undefined;

  return (
    <div className={`tp-page-shell flex flex-col ${shellHeightClass} ${shellGapClass}${shellClassName ? ` ${shellClassName}` : ""}`} style={shellStyle}>
      {useCompactTopNav ? (
        hasCompactHeaderContent ? (
          <header className="tp-page-header tp-page-header-compact fixed inset-x-0 top-0 z-[1000] w-full max-w-none overflow-visible px-0 pb-0 pt-0">
            <div className="w-full max-w-none box-border px-0 pt-[max(env(safe-area-inset-top),0px)]">
              {showUserStatus ? <LeftHamburgerMenu showAlerts={showAlerts} /> : null}
              {showPageTitle ? (
                <div
                  className={`${showUserStatus ? "mt-1" : ""} mx-0 rounded-none border-b border-ht-border-hairline bg-ht-elevated/95 px-2 py-1 text-center text-xs text-ht-fg-muted backdrop-blur`}
                >
                  <span className="font-semibold">{title}</span>
                  {description ? <span className="font-medium">: {description}</span> : null}
                </div>
              ) : null}
            </div>
          </header>
        ) : null
      ) : (
        <header
          className={`tp-page-header sticky top-0 z-20 p-0 overflow-visible${lockViewport ? " transition-[height] duration-150 ease-out" : " h-[13rem] sm:h-[16.5rem] md:h-[19rem]"}`}
          style={lockViewport ? { height: "clamp(5.5rem, calc(var(--tp-vh, 100svh) * 0.26), 13rem)" } : undefined}
        >
          {showBranding ? (
            <img
              src="/brand/hightop-logo-header.png"
              alt="Hightop Challenge"
              className={`block w-full object-contain object-top -translate-y-5 sm:-translate-y-6 md:-translate-y-7${lockViewport ? " transition-[height] duration-150 ease-out" : " h-[17rem] sm:h-[22rem] md:h-[25rem]"}`}
              style={lockViewport ? { height: "clamp(5.5rem, calc(var(--tp-vh, 100svh) * 0.26), 17rem)" } : undefined}
            />
          ) : null}
        </header>
      )}

      {useCompactTopNav && hasCompactHeaderContent ? <div aria-hidden className={`w-full shrink-0 ${compactHeaderSpacerClass}`} /> : null}

      <main className={`tp-page-main min-w-0 ${mainClass}${mainClassName ? ` ${mainClassName}` : ""}`}>
        {noContainer ? (
          <>{children}</>
        ) : (
          <div className="mx-auto w-full max-w-[680px] min-w-0 px-2 sm:px-3 box-border">{children}</div>
        )}
      </main>
    </div>
  );
}
