import { beforeEach, describe, expect, it } from "vitest";
import { consumeMenuHint, OWNER_MENU_HINT_KEY } from "@/lib/ownerMenuHint";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
};

describe("consumeMenuHint", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it("is true exactly once per browser", () => {
    expect(consumeMenuHint(storage)).toBe(true);
    expect(storage.data.get(OWNER_MENU_HINT_KEY)).toBe("1");
    expect(consumeMenuHint(storage)).toBe(false);
  });

  it("does not pulse again for a returning partner", () => {
    storage.setItem(OWNER_MENU_HINT_KEY, "1");
    expect(consumeMenuHint(storage)).toBe(false);
  });

  it("shows nothing when storage is unavailable or throws", () => {
    expect(consumeMenuHint(null)).toBe(false);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(consumeMenuHint(blocked)).toBe(false);
  });

  it("shows nothing when the flag cannot be written (so it never pulses forever)", () => {
    const readOnly = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(consumeMenuHint(readOnly)).toBe(false);
  });
});
