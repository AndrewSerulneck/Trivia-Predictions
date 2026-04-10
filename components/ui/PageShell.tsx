import { UserStatusHeader } from "@/components/ui/UserStatusHeader";
import { HightopLogo } from "@/components/ui/HightopLogo";
import { NotificationBell } from "@/components/ui/NotificationBell";

type PageShellProps = {
  title: string;
  description?: string;
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
}: PageShellProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-4">
      <header className="tp-hud-card sticky top-2 z-20 p-4">
        <div className="flex flex-col gap-3">
          {showUserStatus && showAlerts ? (
            <div className="flex justify-end">
              <div className="max-w-full">
                <NotificationBell />
              </div>
            </div>
          ) : null}
          <div className="text-center">
            {showBranding ? <HightopLogo size="xl" className="mx-auto mb-1 drop-shadow-[0_6px_14px_rgba(31,42,54,0.25)]" /> : null}
            {showBranding ? <p className="text-base font-black uppercase tracking-[0.18em] text-slate-900">Hightop Challenge</p> : null}
            <h1 className="text-[1.75rem] font-semibold tracking-tight text-slate-900">{title}</h1>
            {description ? <p className="mt-1 text-base font-medium text-slate-700">{description}</p> : null}
          </div>
          {showUserStatus ? <UserStatusHeader showAlerts={false} /> : null}
        </div>
      </header>

      <main className="tp-comic-card min-h-0 flex-1 overflow-hidden p-4 text-base">
        {children}
      </main>
    </div>
  );
}
