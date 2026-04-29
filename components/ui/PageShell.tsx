import { UserStatusHeader } from "@/components/ui/UserStatusHeader";
import { HightopLogo } from "@/components/ui/HightopLogo";
import { NotificationBell } from "@/components/ui/NotificationBell";

type PageShellProps = {
  title: string;
  description?: string;
  noContainer?: boolean;
  lockViewport?: boolean;
  showBranding?: boolean;
  showUserStatus?: boolean;
  showAlerts?: boolean;
  showPageTitle?: boolean;
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
}: PageShellProps) {
  const useCompactTopNav = !showBranding;
  const mainClass = noContainer
    ? lockViewport
      ? "min-h-0 flex-1 overflow-hidden p-0"
      : "min-h-0 flex-1 overflow-x-hidden overflow-y-visible p-0"
    : "tp-comic-card min-h-0 flex-1 overflow-x-hidden overflow-y-visible p-3 sm:p-4 text-base";
  const compactHeaderSpacerClass = useCompactTopNav
    ? showUserStatus
      ? showPageTitle
        ? "h-[calc(env(safe-area-inset-top)+5.35rem)] sm:h-[calc(env(safe-area-inset-top)+6.4rem)]"
        : "h-[calc(env(safe-area-inset-top)+4.35rem)] sm:h-[calc(env(safe-area-inset-top)+5.1rem)]"
      : showPageTitle
      ? "h-[calc(env(safe-area-inset-top)+2.9rem)]"
      : "h-0"
    : "h-0";
  const shellGapClass = "gap-3";

  const shellHeightClass = lockViewport ? "h-[100svh] min-h-[100svh] max-h-[100svh] overflow-hidden" : "min-h-[100dvh] overflow-x-hidden";

  return (
    <div className={`tp-page-shell flex flex-col ${shellHeightClass} ${shellGapClass}`}>
      {useCompactTopNav ? (
        <header className="tp-page-header tp-page-header-compact fixed inset-x-0 top-0 z-[1000] w-full max-w-none overflow-visible px-0 pb-0 pt-0">
          <div className="w-full max-w-none box-border px-0 pt-[max(env(safe-area-inset-top),0px)]">
            {showUserStatus ? <UserStatusHeader showAlerts={showAlerts} /> : null}
            {showPageTitle ? (
              <div
                className={`${showUserStatus ? "mt-1" : ""} mx-0 rounded-none border border-slate-900/20 bg-[#fff7ea]/92 px-2 py-1 text-center text-xs text-slate-800 shadow-sm`}
              >
                <span className="font-semibold">{title}</span>
                {description ? <span className="font-medium">: {description}</span> : null}
              </div>
            ) : null}
          </div>
        </header>
      ) : (
        <header className="tp-page-header tp-hud-card sticky top-2 z-20 overflow-x-hidden p-1 sm:p-4 min-h-[6.75rem] sm:min-h-[9.5rem] md:min-h-[11.5rem]">
          <div className="w-full max-w-full sm:max-w-[720px] mx-auto px-1 sm:px-2 box-border">
            <div className="relative flex flex-col items-center justify-center sm:items-start">
              <div className="flex justify-center items-start">
                {showBranding ? (
                  <HightopLogo
                    size="xl"
                    className="h-24 sm:h-40 md:h-52 w-auto drop-shadow-[0_6px_14px_rgba(31,42,54,0.25)]"
                  />
                ) : null}
              </div>

              <div className="mt-1 flex justify-center sm:absolute sm:right-0 sm:top-0 sm:mt-0 sm:justify-end">
                {showUserStatus && showAlerts ? <NotificationBell /> : null}
              </div>
            </div>

            <div className={`${showPageTitle ? "mt-4" : "mt-2"} text-center`}>
              {showPageTitle ? (
                <>
                  <h1 className="text-[0.95rem] sm:text-[1.25rem] md:text-[1.5rem] font-semibold tracking-tight text-slate-900 inline">
                    {title}
                    {description ? ": " : null}
                  </h1>
                  {description ? <span className="font-medium"> {description}</span> : null}
                </>
              ) : null}

              <div className="mt-3">
                {showUserStatus ? <UserStatusHeader showAlerts={showAlerts} /> : null}
              </div>
            </div>
          </div>
        </header>
      )}

      {useCompactTopNav ? <div aria-hidden className={`w-full shrink-0 ${compactHeaderSpacerClass}`} /> : null}

      <main className={`tp-page-main min-w-0 ${mainClass}`}>
        {noContainer ? (
          <>{children}</>
        ) : (
          <div className="mx-auto w-full max-w-[680px] min-w-0 px-2 sm:px-3 box-border">{children}</div>
        )}
      </main>
    </div>
  );
}
