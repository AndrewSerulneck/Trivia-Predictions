import { UserStatusHeader } from "@/components/ui/UserStatusHeader";

type PageShellProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
};

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          </div>
          <UserStatusHeader />
        </div>
      </header>

      <main className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {children}
      </main>
    </div>
  );
}
