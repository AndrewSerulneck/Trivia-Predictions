"use client";

import { useCallback, useEffect, useState } from "react";
import type { Venue } from "@/types";
import {
  ADMIN_NAV_GROUPS,
  MIGRATED_SECTIONS,
  type AdminSection,
  type AdminSectionOption,
} from "@/components/admin/adminSections";
import { AccountsSection } from "@/components/admin/sections/AccountsSection";
import { UsersSection } from "@/components/admin/sections/UsersSection";
import { UserAnalyticsSection } from "@/components/admin/sections/UserAnalyticsSection";
import { VenuesSection } from "@/components/admin/sections/VenuesSection";
import { ChallengesSection } from "@/components/admin/sections/ChallengesSection";
import { SchedulesSection } from "@/components/admin/sections/SchedulesSection";
import { TriviaListSection } from "@/components/admin/sections/TriviaListSection";
import { TriviaCreateSection } from "@/components/admin/sections/TriviaCreateSection";
import { TriviaPendingReviewSection } from "@/components/admin/sections/TriviaPendingReviewSection";
import { TriviaAnswerGraderSection } from "@/components/admin/sections/TriviaAnswerGraderSection";
import { TriviaImageReviewSection } from "@/components/admin/sections/TriviaImageReviewSection";
import { AdPlacementBuilder } from "@/components/admin/AdPlacementBuilder";
import { AdAnalyticsDashboard } from "@/components/admin/AdAnalyticsDashboard";
import { AdsListSection } from "@/components/admin/sections/AdsListSection";
import { AdsCreateSection } from "@/components/admin/sections/AdsCreateSection";
import { PickEmSettlementSection } from "@/components/admin/sections/PickEmSettlementSection";
import { ScategoriesSection } from "@/components/admin/sections/ScategoriesSection";
import { QuestionInventoryAlert } from "@/components/admin/sections/QuestionInventoryAlert";
import { SectionErrorBoundary } from "@/components/admin/SectionErrorBoundary";

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
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mb-2 text-2xl font-bold text-slate-900">Hightop Admin</div>
          <div className="text-sm text-slate-500">Sign in to continue</div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
  mobile?: boolean;
  onClose?: () => void;
};

function Sidebar({ activeSection, onSelect, onLogout, mobile = false, onClose }: SidebarProps) {
  return (
    <nav
      className="flex flex-col bg-slate-900"
      style={{
        width: mobile ? "100%" : 240,
        minWidth: mobile ? "100%" : 240,
        maxWidth: mobile ? "100%" : 240,
        minHeight: "100vh",
      }}
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

      {/* Logout */}
      <div className="border-t border-slate-800 p-4">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
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
};

type AuthState = "checking" | "unauthenticated" | "authenticated";

export function AdminShell({ venues, initialSection = "venue-users" }: AdminShellProps) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [venueList, setVenueList] = useState<Venue[]>(venues);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      setAuthState(res.ok ? "authenticated" : "unauthenticated");
    } catch {
      setAuthState("unauthenticated");
    }
  }, []);

  useEffect(() => {
    const syncBreakpoint = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileSidebarOpen(false);
    };
    syncBreakpoint();
    window.addEventListener("resize", syncBreakpoint);
    return () => window.removeEventListener("resize", syncBreakpoint);
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

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-sm text-slate-400">Verifying session…</div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
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
        return <VenuesSection venues={venueList} onVenueCreated={handleVenueCreated} />;
      case "challenge-campaigns":
        return <ChallengesSection venues={venueList} />;
      case "live-trivia":
        return <SchedulesSection venues={venueList} />;
      case "trivia-list":
        return <TriviaListSection />;
      case "trivia-create":
        return <TriviaCreateSection />;
      case "trivia-review":
        return <TriviaPendingReviewSection />;
      case "answer-grading":
        return <TriviaAnswerGraderSection />;
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
      case "pickem-settlement":
        return <PickEmSettlementSection />;
      case "scategories":
        return <ScategoriesSection venues={venueList} />;
      default:
        return currentSectionOption ? <LegacyPanel section={currentSectionOption} /> : null;
    }
  }

  const handleSectionSelect = (section: AdminSection) => {
    setActiveSection(section);
    if (isMobile) setMobileSidebarOpen(false);
  };

  return (
    <div className="w-full h-screen max-h-screen m-0 p-0 flex bg-[#030712] overflow-hidden">
      {!isMobile ? (
        <Sidebar
          activeSection={activeSection}
          onSelect={handleSectionSelect}
          onLogout={handleLogout}
        />
      ) : null}

      {isMobile ? (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] transition-opacity duration-300 ${
              mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!mobileSidebarOpen}
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-[78vw] max-w-sm transform transition-transform duration-300 ${
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
            aria-hidden={!mobileSidebarOpen}
          >
            <Sidebar
              activeSection={activeSection}
              onSelect={handleSectionSelect}
              onLogout={handleLogout}
              mobile
              onClose={() => setMobileSidebarOpen(false)}
            />
          </aside>
        </>
      ) : null}

      <main className="h-full min-w-0 flex flex-1 flex-col overflow-hidden">
        {/* Top header bar */}
        <div className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-8">
          {isMobile ? (
            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen((prev) => !prev)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <span className="text-xl leading-none">☰</span>
            </button>
          ) : null}
          <h1 className="text-sm font-semibold text-slate-800">
            {currentSectionOption?.label ?? "Dashboard"}
          </h1>
        </div>

        {/* Content area */}
        <div className="h-full flex-1 overflow-y-auto p-4 md:p-6 box-border">
          <QuestionInventoryAlert />
          <SectionErrorBoundary>{renderContent()}</SectionErrorBoundary>
        </div>
      </main>
    </div>
  );
}
