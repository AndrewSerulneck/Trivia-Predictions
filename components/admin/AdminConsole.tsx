"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ADMIN_SECTION_OPTIONS, type AdminSection } from "@/components/admin/adminSections";
import { supabase } from "@/lib/supabase";
import type { Venue } from "@/types";

type LoadState = "idle" | "loading" | "error";

type AdminConsoleProps = {
  venues: Venue[];
  mode?: "dashboard" | "section";
  initialSection?: AdminSection;
};

export function AdminConsole({ venues, mode = "dashboard", initialSection }: AdminConsoleProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [authInitialized, setAuthInitialized] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection ?? "ads-list");
  const [availableVenues] = useState<Venue[]>(venues);
  const [adminLoginUsername, setAdminLoginUsername] = useState("");
  const [adminLoginPassword, setAdminLoginPassword] = useState("");
  const [bootstrappingAdmin, setBootstrappingAdmin] = useState(false);
  const [adminLoginMessage, setAdminLoginMessage] = useState("");

  const checkSession = useCallback(async () => {
    setErrorMessage("");
    try {
      const adminSessionResponse = await fetch("/api/admin/session", { cache: "no-store" });
      if (adminSessionResponse.ok) {
        // Cookie-backed admin auth is authoritative for admin console access.
        setAccessToken("admin-cookie-session");
        return;
      }
      if (!supabase) {
        setErrorMessage("Supabase client is not available.");
        setState("error");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        setAccessToken(data.session.access_token);
      } else {
        setAccessToken("");
      }
    } catch (e: any) {
      setErrorMessage(e.message);
    } finally {
      setState("idle");
      setAuthInitialized(true);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

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

  const bootstrapAdmin = async () => {
    setBootstrappingAdmin(true);
    setAdminLoginMessage("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminLoginUsername, password: adminLoginPassword }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setAdminLoginMessage(payload.error ?? "Failed to create admin session.");
      } else {
        setAdminLoginMessage("Logged in successfully. You can now use the admin panel.");
        void checkSession();
      }
    } catch {
      setAdminLoginMessage("Network error. Please try again.");
    }
    setBootstrappingAdmin(false);
  };

  const shouldRenderSectionContent = state === "idle" && authInitialized && accessToken;
  const ActiveComponent = ADMIN_SECTION_OPTIONS.find((opt) => opt.id === activeSection)?.component;

  return (
    <div className="mx-auto w-full max-w-5xl p-3 [color-scheme:light]">
      <h1 className="text-xl font-semibold">BDL Admin</h1>
      <p className="mb-4 text-sm text-slate-600">Internal system management and operations.</p>

      {!authInitialized ? (
        <p>Authenticating...</p>
      ) : accessToken ? (
        <div className="space-y-4">
          <nav className="flex flex-wrap gap-2">
            {ADMIN_SECTION_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  activeSection === item.id
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {shouldRenderSectionContent && ActiveComponent ? (
            <div className="mt-4">
              <ActiveComponent venues={availableVenues} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Admin Login</h2>
          <p className="mb-3 text-sm text-slate-600">
            You need to be logged in as an admin to access this console.
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={adminLoginUsername}
              onChange={(e) => setAdminLoginUsername(e.target.value)}
              placeholder="Admin Username"
              autoComplete="username"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <input
              type="password"
              value={adminLoginPassword}
              onChange={(e) => setAdminLoginPassword(e.target.value)}
              placeholder="Admin Password"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="button"
              onClick={() => {
                void bootstrapAdmin();
              }}
              disabled={bootstrappingAdmin}
              className="w-full rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {bootstrappingAdmin ? "Logging in..." : "Log In"}
            </button>
            {adminLoginMessage && <p className="text-sm text-red-600">{adminLoginMessage}</p>}
          </div>
        </div>
      )}
      {errorMessage && <p className="mt-4 text-sm text-red-600">{errorMessage}</p>}
    </div>
  );
}
