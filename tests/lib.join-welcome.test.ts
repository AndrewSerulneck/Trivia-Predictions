import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getJoinWelcomeStorageKey, markJoinWelcomeSeen, shouldShowJoinWelcome } from "@/lib/joinWelcome";

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
  const windowStub = {
    localStorage: new MemoryStorage(),
  };

  Object.defineProperty(globalThis, "window", { value: windowStub, configurable: true });
}

describe("join welcome gating", () => {
  beforeEach(() => {
    installBrowserStubs();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("shows the welcome on first visit and skips it within 14 days", () => {
    const now = Date.UTC(2026, 6, 2, 12, 0, 0);

    expect(shouldShowJoinWelcome(now)).toBe(true);

    markJoinWelcomeSeen(now);

    expect(shouldShowJoinWelcome(now + 13 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("shows the welcome again at 14 days or more since the last visit", () => {
    const now = Date.UTC(2026, 6, 2, 12, 0, 0);
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    markJoinWelcomeSeen(now);

    expect(shouldShowJoinWelcome(now + fourteenDaysMs)).toBe(true);
    expect(shouldShowJoinWelcome(now + fourteenDaysMs + 1)).toBe(true);
  });

  it("treats invalid stored values as needing the welcome", () => {
    const key = getJoinWelcomeStorageKey();
    window.localStorage.setItem(key, "not-a-timestamp");

    expect(shouldShowJoinWelcome(Date.UTC(2026, 6, 2, 12, 0, 0))).toBe(true);
  });
});

