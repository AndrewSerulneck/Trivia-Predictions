import Link from "next/link";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { PredictionQuotaBadge } from "@/components/ui/PredictionQuotaBadge";

type PageShellProps = {
  title: string;
  description: string;
  children?: React.ReactNode;
};

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/join", label: "Join" },
  { href: "/trivia", label: "Trivia" },
  { href: "/predictions", label: "Predictions" },
  { href: "/activity", label: "Activity" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/admin", label: "Admin" },
];

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <PredictionQuotaBadge />
            <NotificationBell />
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <main className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {children}
      </main>
    </div>
  );
}
