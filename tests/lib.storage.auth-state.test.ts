import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getJoinWelcomeStorageKey } from "@/lib/joinWelcome";
import { clearClientState, getUserId, getVenueId, saveUserId, saveVenueId } from "@/lib/storage";

class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

function installBrowserStubs() {
  const cookieMap = new Map<string, string>();
  const documentStub = {
    get cookie() {
      return Array.from(cookieMap.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
    },
    set cookie(value: string) {
      const [pair, ...attributes] = value.split(";");
      const [rawKey, rawVal = ""] = pair.split("=");
      const key = rawKey.trim();
      const val = rawVal.trim();
      const maxAgeAttr = attributes.find((attr) => attr.trim().toLowerCase().startsWith("max-age="));
      const maxAgeValue = Number((maxAgeAttr ?? "").split("=")[1]);
      if (Number.isFinite(maxAgeValue) && maxAgeValue <= 0) {
        cookieMap.delete(key);
        return;
      }
      cookieMap.set(key, val);
    },
  };

  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const windowStub = {
    localStorage,
    sessionStorage,
    dispatchEvent: () => true,
  };

  Object.defineProperty(globalThis, "document", { value: documentStub, configurable: true });
  Object.defineProperty(globalThis, "window", { value: windowStub, configurable: true });
}

describe("storage auth state", () => {
  beforeEach(() => {
    installBrowserStubs();
    clearClientState();
  });

  afterEach(() => {
    clearClientState();
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
  });

  it("persists user + venue markers for auth/session propagation", () => {
    saveUserId("user-123");
    saveVenueId("venue-abc");

    expect(getUserId()).toBe("user-123");
    expect(getVenueId()).toBe("venue-abc");
  });

  it("clears user + venue markers without leaving stale cookies", () => {
    saveUserId("user-456");
    saveVenueId("venue-def");
    clearClientState();

    expect(getUserId()).toBeNull();
    expect(getVenueId()).toBeNull();
  });

  it("preserves the join welcome timestamp during auth reset", () => {
    const key = getJoinWelcomeStorageKey();
    window.localStorage.setItem(key, "123456789");

    clearClientState();

    expect(window.localStorage.getItem(key)).toBe("123456789");
  });
});
