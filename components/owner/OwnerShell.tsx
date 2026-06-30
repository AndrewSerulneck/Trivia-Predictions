import { ExplodingLogo } from "@/components/ui/ExplodingLogo";

type OwnerShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "lg";
};

export const OwnerShell = ({ title, subtitle, children, maxWidth = "sm" }: OwnerShellProps) => {
  const widthClass = maxWidth === "lg" ? "max-w-2xl" : "max-w-sm";
  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-slate-900 px-4 py-10">
      <div className={`w-full ${widthClass}`}>
        <div className="mb-6 text-center">
          <ExplodingLogo width={320} />
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">{children}</div>
      </div>
    </div>
  );
};

export const ownerInputClass =
  "owner-input w-full rounded-lg border border-slate-300 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export const ownerLabelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";

export const ownerPrimaryButtonClass =
  "w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50";
