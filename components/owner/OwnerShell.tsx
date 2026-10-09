import { ExitBackButton, type ExitBackButtonProps } from "@/components/navigation/ExitBackButton";
import { OwnerAccountMenu } from "@/components/owner/OwnerAccountMenu";
import { OwnerAppBar } from "@/components/owner/OwnerAppBar";
import { ExplodingLogo } from "@/components/ui/ExplodingLogo";

type OwnerShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "lg";
  /**
   * "light" (default) keeps the legacy white-card shell used by the auth/billing
   * pages. "dark" is the dark-native Partner Dashboard surface (per
   * docs/partner-dashboard-design.md): canvas background, no white card — screens
   * render their own ht-surface cards.
   */
  variant?: "light" | "dark";
  /**
   * Header back slot (Phase 5, docs/navigation-unification-plan.md §4/§10f).
   * Renders the canonical ExitBackButton in the leading slot when no account
   * menu is shown, otherwise in the trailing slot of the header row,
   * above the logo block, replacing every page's hand-rolled "← Dashboard" /
   * "← Back" link. Omit on a root screen (the dashboard itself).
   *
   * The header row sits on the shell's outer background — `bg-ht-canvas` (dark
   * variant) or `bg-slate-900` (light variant) — both dark, so the control uses
   * the default dark tone on either. Pass `backTo={{ tone: "light", … }}` only
   * if a future shell puts this row on a light surface.
   */
  backTo?: ExitBackButtonProps;
  /**
   * Show the account menu (leading slot of the header row) containing the
   * partner Sign Out action. Set on every authenticated /owner/* page; leave off on
   * the pre-auth pages (login / register / forgot-password / reset-password).
   *
   * Light variant only. The dark variant ignores it: Sign Out lives in the
   * dashboard's logo menu (OwnerAppBar), one Back tap away from any sub-page.
   */
  showAccountMenu?: boolean;
  /**
   * Dark variant only: replaces the title in the compact bar's centre (the
   * dashboard puts the venue name / switcher here). `title` is then kept as a
   * screen-reader-only heading.
   */
  barCenter?: React.ReactNode;
};

export const OwnerShell = ({
  title,
  subtitle,
  children,
  maxWidth = "sm",
  variant = "light",
  backTo,
  showAccountMenu = false,
  barCenter,
}: OwnerShellProps) => {
  const widthClass = maxWidth === "lg" ? "max-w-2xl" : "max-w-sm";

  if (variant === "dark") {
    // Compact app bar (redesign plan §4g): Back top-left (or the logo menu when
    // there is no backTo, i.e. the dashboard), title in the bar, no big logo.
    return (
      <div className="min-h-screen bg-ht-canvas">
        <OwnerAppBar leading={backTo ? <ExitBackButton {...backTo} /> : undefined}>
          {barCenter ? (
            <>
              <h1 className="sr-only">{title}</h1>
              {barCenter}
            </>
          ) : (
            <h1 className="truncate text-base font-black text-ht-primary">{title}</h1>
          )}
        </OwnerAppBar>
        <div className={`mx-auto w-full px-4 pb-16 pt-5 ${widthClass}`}>
          {subtitle ? <p className="mb-5 text-sm font-semibold text-ht-muted">{subtitle}</p> : null}
          {children}
        </div>
      </div>
    );
  }

  const headerRow =
    backTo || showAccountMenu ? (
      <div className="mb-4 flex items-center justify-between gap-3">
        {showAccountMenu ? (
          <OwnerAccountMenu />
        ) : backTo ? (
          <ExitBackButton {...backTo} />
        ) : (
          <span aria-hidden="true" />
        )}
        {showAccountMenu && backTo ? <ExitBackButton {...backTo} /> : null}
      </div>
    ) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-slate-900 px-4 py-10">
      <div className={`w-full ${widthClass}`}>
        {headerRow}
        <div className="mb-6 text-center">
          <ExplodingLogo width={256} variant="slate" />
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
