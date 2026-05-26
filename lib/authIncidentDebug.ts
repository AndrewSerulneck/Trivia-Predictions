function normalizeBoolean(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readBrowserDebugToggle(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const fromSession = window.sessionStorage.getItem("tp:auth-incident-debug");
    const fromLocal = window.localStorage.getItem("tp:auth-incident-debug");
    return normalizeBoolean(fromSession ?? fromLocal ?? "");
  } catch {
    return false;
  }
}

export function isAuthIncidentDebugEnabled(): boolean {
  const envEnabled =
    normalizeBoolean(process.env.NEXT_PUBLIC_AUTH_INCIDENT_DEBUG) ||
    normalizeBoolean(process.env.AUTH_INCIDENT_DEBUG);
  if (envEnabled) {
    return true;
  }
  return readBrowserDebugToggle();
}

export function logAuthIncident(scope: string, event: string, details?: Record<string, unknown>): void {
  if (!isAuthIncidentDebugEnabled()) {
    return;
  }
  const stamp = new Date().toISOString();
  const payload = details ?? {};
  if (typeof window === "undefined") {
    console.info(`[AuthIncident][${stamp}][${scope}] ${event}`, payload);
    return;
  }
  console.info(`[AuthIncident][${stamp}][${scope}] ${event}`, payload);
}
