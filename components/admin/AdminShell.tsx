"use client";

import { useCallback, useEffect, useState } from "react";
import type { Venue } from "@/types";
import { adminLabel } from "@/lib/adminStyles";
import {
  ADMIN_NAV_GROUPS,
  MIGRATED_SECTIONS,
  MOBILE_SECTION_ORDER,
  MOBILE_SECTIONS,
  type AdminSection,
  type AdminSectionOption,
} from "@/components/admin/adminSectionMeta";
import { QuestionInventoryAlert } from "@/components/admin/sections/QuestionInventoryAlert";
import { SectionErrorBoundary } from "@/components/admin/SectionErrorBoundary";
import { AdminModeChooser, type AdminMode } from "@/components/admin/AdminModeChooser";
import { AdminMobileShell } from "@/components/admin/AdminMobileShell";
import {
  AccountsSection,
  UsersSection,
  UserAnalyticsSection,
  VenuesSection,
  ChallengesSection,
  SchedulesSection,
  TriviaListSection,
  TriviaPendingReviewSection,
  TriviaImageReviewSection,
  AdPlacementBuilder,
  AdAnalyticsDashboard,
  AdsListSection,
  AdsCreateSection,
  GameSettingsSection,
  CategoryBlitzSection,
  BillingSection,
  LiveTriviaInventorySection,
  UsernameModerationSection,
  LlmCostSection,
} from "@/components/admin/adminSectionComponents";

const ADMIN_MODE_STORAGE_KEY = "hightop_admin_mode";

function readStoredAdminMode(): AdminMode | null {
  try {
    const value = window.localStorage.getItem(ADMIN_MODE_STORAGE_KEY);
    return value === "desktop" || value === "mobile" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredAdminMode(mode: AdminMode): void {
  try {
    window.localStorage.setItem(ADMIN_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures (private mode / strict privacy settings).
  }
}

// ─── Shared Admin UI Primitives ───────────────────────────────────────────────

export type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function PaginationBar({ page, totalPages, total, pageSize, onPageChange }: PaginationProps) {
  const start = Math.min(total, (page - 1) * pageSize + 1);
  const end = Math.min(total, page * pageSize);

  const pages: number[] = [];
  const maxVisible = 7;
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push(-1);
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push(-2);
    pages.push(totalPages);
  }

  const btnBase =
    "inline-flex h-8 min-w-[2rem] items-center justify-center rounded px-2 text-sm font-medium transition-colors";
  const btnActive = `${btnBase} bg-indigo-600 text-white`;
  const btnDefault = `${btnBase} text-slate-600 hover:bg-slate-100`;
  const btnDisabled = `${btnBase} text-slate-300 cursor-not-allowed`;

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3">
      <span className="text-sm text-slate-500">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className={page === 1 ? btnDisabled : btnDefault}
          title="First page"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={page === 1 ? btnDisabled : btnDefault}
          title="Previous page"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p < 0 ? (
            <span key={`ellipsis-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={p === page ? btnActive : btnDefault}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={page === totalPages ? btnDisabled : btnDefault}
          title="Next page"
        >
          ›
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className={page === totalPages ? btnDisabled : btnDefault}
          title="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}

export type BulkActionBarProps = {
  count: number;
  onEnableSelected?: () => void;
  onDisableSelected?: () => void;
  onDeleteSelected: () => void;
  onClear: () => void;
  busy?: boolean;
};

export function BulkActionBar({
  count,
  onEnableSelected,
  onDisableSelected,
  onDeleteSelected,
  onClear,
  busy = false,
}: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="mb-4 flex flex-col items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 sm:flex-row sm:items-center">
      <span className="text-sm font-medium text-indigo-800">
        {count} selected
      </span>
      <div className="hidden h-4 w-px bg-indigo-200 sm:block" />
      {onEnableSelected && (
        <button
          onClick={onEnableSelected}
          disabled={busy}
          className="min-h-[44px] w-full text-left text-sm font-medium text-indigo-700 hover:text-indigo-900 disabled:opacity-50 sm:min-h-0 sm:w-auto"
        >
          Enable
        </button>
      )}
      {onDisableSelected && (
        <button
          onClick={onDisableSelected}
          disabled={busy}
          className="min-h-[44px] w-full text-left text-sm font-medium text-indigo-700 hover:text-indigo-900 disabled:opacity-50 sm:min-h-0 sm:w-auto"
        >
          Disable
        </button>
      )}
      <button
        onClick={onDeleteSelected}
        disabled={busy}
        className="min-h-[44px] w-full text-left text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50 sm:min-h-0 sm:w-auto"
      >
        Delete
      </button>
      <button
        onClick={onClear}
        disabled={busy}
        className="min-h-[44px] w-full text-left text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 sm:ml-auto sm:min-h-0 sm:w-auto"
      >
        Clear
      </button>
    </div>
  );
}

// ─── Admin Table Primitives ───────────────────────────────────────────────────

export const TH = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const TD = "px-4 py-3 text-sm text-slate-700";
export const TR = "border-b border-slate-100 hover:bg-slate-50 transition-colors";

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        setError(payload.error ?? "Invalid credentials.");
      } else {
        onSuccess();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    /* `h-full overflow-y-auto`, not `min-h-screen`: inside AppShell's locked
       admin box the document cannot scroll, so a `min-h` root would strand the
       submit button off-screen once a soft keyboard shrinks the visual
       viewport. Bounded + `overflow-y-auto` keeps the form reachable. */
    <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-900 [color-scheme:light]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mb-2 text-2xl font-bold text-slate-900">Hightop Admin</div>
          <div className="text-sm text-slate-500">Sign in to continue</div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={adminLabel}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className={adminLabel}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Legacy Section Panel ─────────────────────────────────────────────────────

function LegacyPanel({ section }: { section: AdminSectionOption }) {
  const statusLabel = section.status?.label ?? "Planned";

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
        <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-slate-800">{section.label}</h2>
      <p className="mb-6 max-w-sm text-sm text-slate-500">
        This section is being upgraded to the new desktop admin and will be available soon. Current status:{" "}
        <span className="font-medium text-slate-700">{statusLabel}</span>.
      </p>
      <a
        href={`/admin/${section.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        Open in Legacy Admin
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    </div>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────

type SidebarProps = {
  activeSection: AdminSection;
  onSelect: (section: AdminSection) => void;
  onLogout: () => void;
  onSwitchToMobile: () => void;
  mobile?: boolean;
  onClose?: () => void;
};

function Sidebar({ activeSection, onSelect, onLogout, onSwitchToMobile, mobile = false, onClose }: SidebarProps) {
  return (
    /* `h-full`, not the previous inline `minHeight: 100svh`: this nav sits
       inside the now definite-height (`h-full`) shell root, and a `min-height`
       larger than that box would push the flex line past the root's
       `overflow-hidden` clip and cut off the logout/mode-switch footer below.
       `h-full` fills exactly the root, letting the `flex-1 overflow-y-auto`
       nav-group list at :368 scroll internally instead.
       See docs/admin-mobile-remediation-plan.md Phase R3. */
    <nav
      className={`flex h-full flex-col bg-slate-900 ${
        mobile
          ? "w-full min-w-full max-w-full"
          : // Explicit px, not `w-60`: globals.css drops the root font to 14px
            // under 430px, which would make a rem-based `w-60` 210px instead of
            // the 240px this sidebar has always been.
            "w-[240px] min-w-[240px] max-w-[240px]"
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-slate-800 px-5">
        <span className="flex-1 text-sm font-bold tracking-widest text-white">HIGHTOP ADMIN</span>
        {mobile && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            <div className="px-5 pb-1 pt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive = activeSection === item.id;
              const isMigrated = MIGRATED_SECTIONS.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={[
                    "flex w-full items-center justify-between px-5 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-indigo-700 font-semibold text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white",
                  ].join(" ")}
                >
                  <span>{item.label}</span>
                  {item.status?.label ? (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${item.status.tone === 'live' ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-700 text-slate-400'}`}>
                      {item.status.label}
                    </span>
                  ) : !isMigrated ? (
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                      Planned
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Mode switch + logout */}
      <div className="border-t border-slate-800 p-4">
        <button
          onClick={onSwitchToMobile}
          className="mb-1 flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v16a1 1 0 001 1z" />
          </svg>
          Switch to Mobile
        </button>
        <button
          onClick={onLogout}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
          Sign out
        </button>
      </div>
    </nav>
  );
}

// ─── Admin Shell ──────────────────────────────────────────────────────────────

type AdminShellProps = {
  venues: Venue[];
  initialSection?: AdminSection;
  // True when initialSection came from an explicit deep link (e.g. a
  // ?section= query param) rather than the default landing section. Deep
  // links bypass the desktop/mobile chooser entirely (Phase 3, §A).
  deepLinked?: boolean;
};

type AuthState = "checking" | "unauthenticated" | "authenticated";
// "chooser" = post-login interstitial not yet resolved; "checking" covers both
// the auth check and the brief localStorage read right after login succeeds.
type ModeState = "checking" | "chooser" | AdminMode;

export function AdminShell({ venues, initialSection = "venue-users", deepLinked = false }: AdminShellProps) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [venueList, setVenueList] = useState<Venue[]>(venues);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modeState, setModeState] = useState<ModeState>("checking");
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      setAuthState(res.ok ? "authenticated" : "unauthenticated");
    } catch {
      setAuthState("unauthenticated");
    }
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetch("/api/admin/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        if (!cancelled) {
          setAuthState(res.ok ? "authenticated" : "unauthenticated");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthState("unauthenticated");
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        void checkSession();
      }
    };
    const onFocus = () => {
      void checkSession();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkSession]);

  // Resolve the chooser once login succeeds. Deep links always skip the
  // chooser: they land on mobile only if that's the stored preference AND the
  // deep-linked section is one of the three mobile-allowlisted sections;
  // otherwise they land on desktop, since desktop can render any section.
  useEffect(() => {
    if (authState !== "authenticated") return;
    const stored = readStoredAdminMode();
    if (deepLinked) {
      setModeState(stored === "mobile" && MOBILE_SECTIONS.has(activeSection) ? "mobile" : "desktop");
      return;
    }
    if (stored === "mobile") {
      setActiveSection((prev) => (MOBILE_SECTIONS.has(prev) ? prev : MOBILE_SECTION_ORDER[0]));
    }
    setModeState(stored ?? "chooser");
    // Only re-run when auth/deep-link identity changes, not on every
    // activeSection change from in-shell navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, deepLinked]);

  const handleLoginSuccess = useCallback(() => {
    setAuthState("authenticated");
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthState("unauthenticated");
  }, []);

  const handleVenueCreated = useCallback((venue: Venue) => {
    setVenueList((prev) => [venue, ...prev]);
  }, []);

  const handleVenueUpdated = useCallback((venue: Venue) => {
    setVenueList((prev) => prev.map((entry) => (entry.id === venue.id ? venue : entry)));
  }, []);

  const handleVenueDeleted = useCallback((venueId: string) => {
    setVenueList((prev) => prev.filter((entry) => entry.id !== venueId));
  }, []);

  const handleSectionSelect = useCallback((section: AdminSection) => {
    setActiveSection(section);
    setMobileSidebarOpen(false);
  }, []);

  const handleChooseMode = useCallback(
    (mode: AdminMode) => {
      writeStoredAdminMode(mode);
      if (mode === "mobile") {
        setActiveSection((prev) => (MOBILE_SECTIONS.has(prev) ? prev : MOBILE_SECTION_ORDER[0]));
      }
      setModeState(mode);
    },
    []
  );

  const handleSwitchToMobile = useCallback(() => {
    writeStoredAdminMode("mobile");
    setActiveSection((prev) => (MOBILE_SECTIONS.has(prev) ? prev : MOBILE_SECTION_ORDER[0]));
    setModeState("mobile");
    setMobileSidebarOpen(false);
  }, []);

  const handleSwitchToDesktop = useCallback(() => {
    writeStoredAdminMode("desktop");
    setModeState("desktop");
  }, []);

  if (authState === "checking") {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <div className="text-sm text-slate-400">Verifying session…</div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  if (modeState === "checking") {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <div className="text-sm text-slate-400">Loading admin…</div>
      </div>
    );
  }

  if (modeState === "chooser") {
    return <AdminModeChooser onChoose={handleChooseMode} />;
  }

  if (modeState === "mobile") {
    return (
      <AdminMobileShell
        venues={venueList}
        activeSection={activeSection}
        onSelect={handleSectionSelect}
        onSwitchToDesktop={handleSwitchToDesktop}
        onLogout={handleLogout}
        onVenueCreated={handleVenueCreated}
        onVenueUpdated={handleVenueUpdated}
        onVenueDeleted={handleVenueDeleted}
      />
    );
  }

  const allSections = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
  const currentSectionOption = allSections.find((s) => s.id === activeSection);

  function renderContent() {
    switch (activeSection) {
      case "accounts":
        return <AccountsSection />;
      case "venue-users":
        return <UsersSection venues={venueList} />;
      case "user-analytics":
        return <UserAnalyticsSection venues={venueList} />;
      case "venue-manage":
        return (
          <VenuesSection
            venues={venueList}
            onVenueCreated={handleVenueCreated}
            onVenueUpdated={handleVenueUpdated}
            onVenueDeleted={handleVenueDeleted}
          />
        );
      case "challenge-campaigns":
        return <ChallengesSection venues={venueList} />;
      case "live-trivia":
        return <SchedulesSection venues={venueList} />;
      case "trivia-list":
        return <TriviaListSection />;
      case "trivia-review":
        return <TriviaPendingReviewSection />;
      case "trivia-image-review":
        return <TriviaImageReviewSection />;
      case "ad-placement":
        return <AdPlacementBuilder venues={venueList} />;
      case "ad-debug":
        return <AdAnalyticsDashboard />;
      case "ads-list":
        return <AdsListSection venues={venueList} />;
      case "ads-create":
        return <AdsCreateSection venues={venueList} />;
      case "game-settings":
        return <GameSettingsSection venues={venueList} />;
      case "live-trivia-inventory":
        return <LiveTriviaInventorySection />;
      case "category-blitz":
        return <CategoryBlitzSection venues={venueList} />;
      case "partner-billing":
        return <BillingSection />;
      case "username-moderation":
        return <UsernameModerationSection />;
      case "llm-cost":
        return <LlmCostSection />;
      default:
        return currentSectionOption ? <LegacyPanel section={currentSectionOption} /> : null;
    }
  }

  return (
    /* `h-full`, not `min-h-[100svh]`: AppShell already renders the admin surface
       inside `fixed inset-0 h-screen overflow-hidden` (AppShell.tsx) on top of
       `html/body { height: 100vh; overflow: hidden }` (globals.css,
       `.tp-admin-theme`), so this root's parent is already a definite-height,
       non-scrolling box. Inheriting it with `h-full` is what makes `main`'s
       `overflow-hidden` and the content pane's `h-full flex-1 overflow-y-auto`
       below resolve. An indefinite `min-h-*` root breaks that chain: the inner
       pane stops being a scroll container and the overflow is clipped
       unreachable, because the document itself cannot scroll to it.
       See docs/admin-mobile-remediation-plan.md Phase R3. */
    <div className="w-full h-full m-0 p-0 flex bg-[#030712] overflow-hidden [color-scheme:light]">
      <div className="hidden md:block">
        <Sidebar
          activeSection={activeSection}
          onSelect={handleSectionSelect}
          onLogout={handleLogout}
          onSwitchToMobile={handleSwitchToMobile}
        />
      </div>

      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] transition-opacity duration-300 md:hidden ${
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!mobileSidebarOpen}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[78vw] max-w-sm transform transition-transform duration-300 md:hidden ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!mobileSidebarOpen}
      >
        <Sidebar
          activeSection={activeSection}
          onSelect={handleSectionSelect}
          onLogout={handleLogout}
          onSwitchToMobile={handleSwitchToMobile}
          mobile
          onClose={() => setMobileSidebarOpen(false)}
        />
      </aside>

      <main className="h-full min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
        {/* Top header bar. `flex-none` so it keeps its `h-14` instead of being
            shrunk by a tall content pane below it. */}
        <div className="flex h-14 flex-none items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-8">
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileSidebarOpen}
            onClick={() => setMobileSidebarOpen((prev) => !prev)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden"
          >
            <span className="text-xl leading-none">☰</span>
          </button>
          <h1 className="text-sm font-semibold text-slate-800">
            {currentSectionOption?.label ?? "Dashboard"}
          </h1>
        </div>

        {/* Content area. `min-h-0 flex-1`, not `h-full flex-1`: `h-full` here
            resolved to 100% of `main` while the `h-14` header also occupies
            part of it, overshooting by the header's height. `flex-1` alone
            claims exactly the remaining space, and `min-h-0` lets it shrink
            below its content so `overflow-y-auto` actually scrolls. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 box-border">
          <QuestionInventoryAlert />
          <SectionErrorBoundary>{renderContent()}</SectionErrorBoundary>
        </div>
      </main>
    </div>
  );
}
