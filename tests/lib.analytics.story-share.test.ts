import { afterEach, describe, expect, it } from "vitest";
import {
  trackStoryShareCompleted,
  trackStoryShareFallbackUsed,
  trackStoryShareOpened,
} from "@/lib/analytics";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function installBrowserStorage() {
  const localStorage = createStorage();
  const sessionStorage = createStorage();

  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage,
      sessionStorage,
    } as unknown as Window,
    configurable: true,
  });

  localStorage.setItem("tp:user-id", "00000000-0000-4000-8000-000000000001");
  localStorage.setItem("tp:venue-id", "venue-a");

  return { localStorage, sessionStorage };
}

function readQueuedEvents(storage: Storage): Array<Record<string, unknown>> {
  const raw = storage.getItem("tp:analytics-queue:v1");
  return raw ? JSON.parse(raw) as Array<Record<string, unknown>> : [];
}

describe("story share analytics", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("queues story share funnel events with game metadata", () => {
    const { sessionStorage } = installBrowserStorage();
    const context = {
      storyShareId: "story-flow-1",
      gameType: "category-blitz" as const,
      templateVariant: "champion" as const,
      finalRank: 1,
      finalPoints: 240,
      correctRate: 92,
      isChampion: true,
    };

    trackStoryShareOpened(context);
    trackStoryShareCompleted({
      ...context,
      shareStatus: "unsupported",
      fallbackRecommended: true,
      resultReason: "Web Share API is unavailable.",
    });
    trackStoryShareFallbackUsed({
      ...context,
      fallbackMode: "download",
      resultReason: "saved",
    });

    const events = readQueuedEvents(sessionStorage);

    expect(events.map((event) => event.type)).toEqual([
      "story_share_opened",
      "story_share_completed",
      "story_share_fallback_used",
    ]);
    expect(events[0]).toMatchObject({
      storyShareId: "story-flow-1",
      gameType: "category-blitz",
      venueId: "venue-a",
      userId: "00000000-0000-4000-8000-000000000001",
      templateVariant: "champion",
      finalRank: 1,
      finalPoints: 240,
      correctRate: 92,
      isChampion: true,
    });
    expect(events[1]).toMatchObject({
      shareStatus: "unsupported",
      fallbackRecommended: true,
      resultReason: "Web Share API is unavailable.",
    });
    expect(events[2]).toMatchObject({
      fallbackMode: "download",
      resultReason: "saved",
    });
  });
});
