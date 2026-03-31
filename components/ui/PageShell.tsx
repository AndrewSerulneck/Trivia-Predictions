import { UserStatusHeader } from "@/components/ui/UserStatusHeader";

type PageShellProps = {
  title: string;
  description?: string;
  showBranding?: boolean;
  showUserStatus?: boolean;
  children?: React.ReactNode;
};

export function PageShell({
  title,
  description,
  showBranding = true,
  showUserStatus = true,
  children,
}: PageShellProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-4">
      <header className="tp-hud-card sticky top-2 z-20 p-4">
        <div className="flex flex-col gap-3">
          <div className="text-center">
            {showBranding ? (
              <p className="text-base font-black uppercase tracking-[0.2em] text-slate-900">Hightop Challenge</p>
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {description ? <p className="mt-1 text-sm font-medium text-slate-700">{description}</p> : null}
          </div>
          {showUserStatus ? <UserStatusHeader /> : null}
        </div>
      </header>

      <main className="tp-comic-card min-h-0 flex-1 overflow-hidden p-4">
        {children}
      </main>
    </div>
  );
}
