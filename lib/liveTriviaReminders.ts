// "Remind me" in the browser/app (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C3): the
// words, the phone's memory of which games it asked about, and the two requests. Client-safe.
//
// Whether a game's reminder is on is remembered on this phone (localStorage), so Venue Home makes no
// request to draw the button. Tapping again is harmless: the server ignores a second "on".

import { getUserId } from "@/lib/storage";

export const GAME_REMINDER_ENDPOINT = "/api/push/game-reminders";

export const GAME_REMINDER_COPY = {
  remind: "Remind me",
  reminderSet: "Reminder set",
  addToCalendar: "Add to calendar",
  failed: "Couldn't save that.",
  changed: "This game has changed.",
  calendarFailed: "Couldn't open your calendar.",
} as const;

const STORE_KEY = "htc:live-trivia-reminders:v1";
const MAX_STORED = 20;

type StoredReminder = { userId: string; scheduleId: string; occurrenceDate: string; startMs: number };

const readStore = (): StoredReminder[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredReminder =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StoredReminder).userId === "string" &&
        typeof (entry as StoredReminder).scheduleId === "string" &&
        typeof (entry as StoredReminder).occurrenceDate === "string" &&
        typeof (entry as StoredReminder).startMs === "number",
    );
  } catch {
    return [];
  }
};

const writeStore = (entries: StoredReminder[], nowMs: number): void => {
  try {
    const kept = entries.filter((entry) => entry.startMs > nowMs).slice(-MAX_STORED);
    window.localStorage.setItem(STORE_KEY, JSON.stringify(kept));
  } catch {
    // Private storage off: the button just forgets after a reload; the reminder itself is on the server.
  }
};

const sameGame = (entry: StoredReminder, userId: string, scheduleId: string, startMs: number): boolean =>
  entry.userId === userId && entry.scheduleId === scheduleId && Math.abs(entry.startMs - startMs) < 60_000;

/** The stored reminder for this player and game, or null. */
export const findStoredReminder = (scheduleId: string, startMs: number): StoredReminder | null => {
  const userId = getUserId();
  if (!userId) return null;
  return readStore().find((entry) => sameGame(entry, userId, scheduleId, startMs)) ?? null;
};

export type ReminderOutcome = "set" | "cleared" | "changed" | "failed";

/** Turns the reminder on for this game. */
export const setGameReminder = async (input: {
  venueId: string;
  scheduleId: string;
  startMs: number;
  nowMs?: number;
}): Promise<ReminderOutcome> => {
  const userId = getUserId();
  if (!userId) return "failed";
  try {
    const response = await fetch(GAME_REMINDER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        venueId: input.venueId,
        scheduleId: input.scheduleId,
        startsAt: new Date(input.startMs).toISOString(),
      }),
    });
    if (response.status === 409) return "changed";
    const reply = (await response.json().catch(() => null)) as { ok?: boolean; occurrenceDate?: unknown } | null;
    if (!response.ok || !reply?.ok || typeof reply.occurrenceDate !== "string") return "failed";
    const nowMs = input.nowMs ?? Date.now();
    const others = readStore().filter((entry) => !sameGame(entry, userId, input.scheduleId, input.startMs));
    writeStore(
      [...others, { userId, scheduleId: input.scheduleId, occurrenceDate: reply.occurrenceDate, startMs: input.startMs }],
      nowMs,
    );
    return "set";
  } catch {
    return "failed";
  }
};

/** Turns it off again. */
export const clearGameReminder = async (input: { scheduleId: string; startMs: number; nowMs?: number }): Promise<ReminderOutcome> => {
  const userId = getUserId();
  const stored = findStoredReminder(input.scheduleId, input.startMs);
  if (!userId || !stored) return "cleared";
  try {
    const response = await fetch(GAME_REMINDER_ENDPOINT, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, scheduleId: stored.scheduleId, occurrenceDate: stored.occurrenceDate }),
    });
    if (!response.ok) return "failed";
    writeStore(
      readStore().filter((entry) => !sameGame(entry, userId, input.scheduleId, input.startMs)),
      input.nowMs ?? Date.now(),
    );
    return "cleared";
  } catch {
    return "failed";
  }
};
