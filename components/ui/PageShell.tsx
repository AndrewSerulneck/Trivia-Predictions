import { UserStatusHeader } from "@/components/ui/UserStatusHeader";
import { HightopLogo } from "@/components/ui/HightopLogo";
import { NotificationBell } from "@/components/ui/NotificationBell";

type PageShellProps = {
  title: string;
  description?: string;
  noContainer?: boolean;
  showBranding?: boolean;
  showUserStatus?: boolean;
  showAlerts?: boolean;
  showPageTitle?: boolean;
  children?: React.ReactNode;
};

export function PageShell({
  title,
  description,
  showBranding = true,
  showUserStatus = true,
  showAlerts = true,
  showPageTitle = true,
  children,
  noContainer = false,
}: PageShellProps) {
  const mainClass = noContainer
    ? "min-h-0 flex-1 overflow-visible p-0"
    : "tp-comic-card min-h-0 flex-1 overflow-hidden p-4 text-base";
  const shellGapClass = showPageTitle ? "gap-4" : "gap-2";

  return (
    <div className={`flex min-h-[100dvh] flex-col ${shellGapClass}`}>
      <header className="tp-hud-card sticky top-2 z-20 p-1 sm:p-4 min-h-[7.5rem] sm:min-h-[9.5rem] md:min-h-[11.5rem]">
        <div className="w-full max-w-[100vw] sm:max-w-[720px] ml-0 px-1 sm:px-2 box-border">
          <div className="relative flex items-start justify-center">
            <div className="flex justify-center items-start">
              {showBranding ? (
                <HightopLogo
                  size="xl"
                  className="h-32 sm:h-40 md:h-52 w-auto drop-shadow-[0_6px_14px_rgba(31,42,54,0.25)]"
                />
              ) : null}
            </div>

            <div className="absolute right-0 top-0 flex justify-end">
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
              {showUserStatus ? <UserStatusHeader showAlerts={false} /> : null}
            </div>
          </div>
        </div>
      </header>

      <main className={mainClass}>
        {noContainer ? (
          <>{children}</>
        ) : (
          <div className="w-full max-w-[100vw] sm:max-w-[720px] ml-0 px-3 box-border">{children}</div>
        )}
      </main>
    </div>
  );
}
