// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TriviaVarietySection, thinThreshold } from "@/components/admin/sections/TriviaVarietySection";
import { CategorySelect } from "@/components/trivia/CategorySelect";
import type { VarietyReport } from "@/types/questionVariety";

// Admin -> Variety page and the player picker (Phase 4a), against fake responses. No network, no database.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const report = (): VarietyReport => ({
  game: "speed", category: "Music", eraSet: ["1980s", "1990s", "2000s"],
  areas: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Pop", eras: ["1980s", "1990s", "2000s"], note: null, active: true, counts: { "1980s": 10, "1990s": 1 } },
    { id: "00000000-0000-4000-8000-000000000002", name: "Country", eras: ["1990s"], note: "include outlaw country", active: false, counts: {} },
  ],
  tagged: 11, unmapped: 0, untagged: 4, topSubjects: [{ subject: "Madonna", count: 4 }], top5Share: 0.5,
});
const posts: Record<string, unknown>[] = [];
const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  posts.length = 0;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return respond({ ok: true }); }
    return respond({ ok: true, categories: { speed: ["Music", "Current Events"], live: ["Music"] }, report: report(), columns: ["1980s", "1990s", "2000s"] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Variety page", () => {
  it("shows counts per era, tints thin cells and summarizes the category", async () => {
    render(createElement(TriviaVarietySection));
    expect(await screen.findByText("Pop")).toBeTruthy();
    expect(screen.getByTestId("variety-summary").textContent).toBe("11 tagged · 4 untagged · Top 5 subjects 50%");
    const thin = document.querySelectorAll("td[data-thin]");
    // Even share of Pop's three cells is 11/3; under half of it (1 and 0) is thin. Country is off.
    expect([...thin].map((cell) => cell.textContent)).toEqual(["1", "0"]);
    expect(screen.getByText("include outlaw country")).toBeTruthy();
    expect(screen.getByText("Madonna")).toBeTruthy();
  });

  it("switches an area and adds one, then says Saved.", async () => {
    render(createElement(TriviaVarietySection));
    fireEvent.click(await screen.findByRole("switch", { name: "Country on" }));
    await screen.findByText("Saved.");
    expect(posts[0]).toEqual({ game: "speed", category: "Music", action: "toggle", id: "00000000-0000-4000-8000-000000000002", active: true });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Yacht rock" } });
    fireEvent.click(screen.getByLabelText("1980s"));
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "include Steely Dan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toEqual({ game: "speed", category: "Music", action: "add", name: "Yacht rock", eras: ["1980s"], note: "include Steely Dan" });
  });

  it("computes the thin threshold from active areas only", () => {
    expect(thinThreshold(report(), ["1980s", "1990s", "2000s"])).toBeCloseTo(11 / 3 / 2);
  });

  it("keeps copy minimal: no text under 12px, never Reward", () => {
    const source = readFileSync("components/admin/sections/TriviaVarietySection.tsx", "utf8");
    expect(source).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/);
    expect(source).not.toMatch(/Reward/);
  });
});

describe("Speed Trivia category picker", () => {
  it("hides a gated category until it's visible", () => {
    const { rerender } = render(createElement(CategorySelect, { onSelect: vi.fn(), hiddenCategories: new Set(["Current Events"]) }));
    expect(screen.queryByText("Current Events")).toBeNull();
    expect(screen.getByText("Music")).toBeTruthy();
    rerender(createElement(CategorySelect, { onSelect: vi.fn(), hiddenCategories: new Set<string>() }));
    expect(screen.getByText("Current Events")).toBeTruthy();
  });
});
