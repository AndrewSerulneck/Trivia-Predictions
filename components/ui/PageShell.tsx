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
  children?: React.ReactNode;
};

export function PageShell({
  title,
  description,
  showBranding = true,
  showUserStatus = true,
  showAlerts = true,
  children,
  noContainer = false,
}: PageShellProps) {
  const mainClass = noContainer
    ? "min-h-0 flex-1 overflow-visible p-0"
    : "tp-comic-card min-h-0 flex-1 overflow-hidden p-4 text-base";

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4">
  <header className="tp-hud-card sticky top-2 z-20 p-1 sm:p-4 min-h-[7.5rem] sm:min-h-[9.5rem] md:min-h-[11.5rem]">
        <div className="w-full max-w-[100vw] sm:max-w-[720px] ml-0 px-1 sm:px-2 box-border">
          <div className="grid grid-cols-[1fr,auto,1fr] items-start gap-3">
            {/* left spacer (keeps logo centered) */}
            <div className="w-full" />

            {/* center: logo */}
            <div className="flex justify-center items-start">
              {showBranding ? (
                <HightopLogo
                  size="xl"
                  className="h-32 sm:h-40 md:h-52 w-auto drop-shadow-[0_6px_14px_rgba(31,42,54,0.25)]"
                />
              ) : null}
            </div>

            {/* right: alerts */}
            <div className="flex justify-end">
              {showUserStatus && showAlerts ? <NotificationBell /> : null}
            </div>
          </div>

          {/* Title line below the grid */}
          <div className="mt-4 text-center">
            <h1 className="text-[0.95rem] sm:text-[1.25rem] md:text-[1.5rem] font-semibold tracking-tight text-slate-900 inline">
              {title}{description ? ": " : null}
            </h1>
            {description ? <span className="font-medium"> {description}</span> : null}

            {/* user status below title on all screens to avoid overlap with logo */}
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
