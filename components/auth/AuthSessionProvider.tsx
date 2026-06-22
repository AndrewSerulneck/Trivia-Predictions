"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import {
  AUTH_STATE_CHANGED_EVENT,
  AUTH_STATE_RESET_EVENT,
  clearClientState,
  getGodMode,
  getUserId,
  getUsername,
  getVenueId,
} from "@/lib/storage";

type AuthPhase = "anonymous" | "authenticated";

type AuthSessionState = {
  phase: AuthPhase;
  userId: string;
  venueId: string;
  username: string;
  tokenVerified: boolean;
  godMode: boolean;
  lastSyncedAt: number;
};

type AuthSessionContextValue = {
  state: AuthSessionState;
  refresh: () => void;
  reset: () => void;
};

type AuthAction =
  | { type: "SYNC"; payload: AuthSessionState }
  | { type: "RESET" };

const INITIAL_AUTH_STATE: AuthSessionState = {
  phase: "anonymous",
  userId: "",
  venueId: "",
  username: "",
  tokenVerified: false,
  godMode: false,
  lastSyncedAt: 0,
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function authReducer(state: AuthSessionState, action: AuthAction): AuthSessionState {
  if (action.type === "RESET") {
    return {
      ...INITIAL_AUTH_STATE,
      lastSyncedAt: Date.now(),
    };
  }
  if (action.type === "SYNC") {
    return action.payload;
  }
  return state;
}

function hasCookie(name: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  try {
    return document.cookie.split(";").some((chunk) => chunk.trim().startsWith(`${name}=`));
  } catch {
    return false;
  }
}

function readAuthStateFromStorage(): AuthSessionState {
  const userId = (getUserId() ?? "").trim();
  const venueId = (getVenueId() ?? "").trim();
  const username = (getUsername() ?? "").trim();
  const hasAuthCookie = hasCookie("tp_user_id");
  const tokenVerified = Boolean(userId && venueId && hasAuthCookie);
  return {
    phase: tokenVerified ? "authenticated" : "anonymous",
    userId,
    venueId,
    username,
    tokenVerified,
    godMode: tokenVerified ? getGodMode() : false,
    lastSyncedAt: Date.now(),
  };
}

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, INITIAL_AUTH_STATE);

  const refresh = useCallback(() => {
    dispatch({
      type: "SYNC",
      payload: readAuthStateFromStorage(),
    });
  }, []);

  const reset = useCallback(() => {
    clearClientState();
    dispatch({ type: "RESET" });
  }, []);

  useEffect(() => {
    refresh();
    const handleSync = () => {
      refresh();
    };
    const handleReset = () => {
      dispatch({ type: "RESET" });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener(AUTH_STATE_CHANGED_EVENT, handleSync as EventListener);
    window.addEventListener(AUTH_STATE_RESET_EVENT, handleReset as EventListener);
    window.addEventListener("storage", handleSync);
    window.addEventListener("focus", handleSync);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, handleSync as EventListener);
      window.removeEventListener(AUTH_STATE_RESET_EVENT, handleReset as EventListener);
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("focus", handleSync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      state,
      refresh,
      reset,
    }),
    [refresh, reset, state]
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }
  return context;
}
