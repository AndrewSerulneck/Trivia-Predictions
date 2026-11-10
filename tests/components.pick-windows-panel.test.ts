// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PickWindowsPanel } from "@/components/gameSettings/PickWindowsPanel";
import { DEFAULT_PICK_WINDOW } from "@/lib/pickemPickWindowForm";

vi.mock("@/components/navigation/nativeBackButton", () => ({ useNativeBackHandler: () => undefined }));

// Away-mode plan Phase B4: Game Settings' pick windows save only what changed through the B1 save.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPanel = (tone: "owner" | "admin", saved = {}) => {
  const onSaved = vi.fn();
  const onUnauthorized = vi.fn();
  render(
    createElement(PickWindowsPanel, {
      tone,
      endpoint: `/api/${tone}/game-settings`,
      venueId: "bar-1",
      saved,
      onSaved,
      onUnauthorized: tone === "owner" ? onUnauthorized : undefined,
    }),
  );
  return { onSaved, onUnauthorized };
};

describe("PickWindowsPanel", () => {
  it.each(["owner", "admin"] as const)("%s: Set days → save sends that sport's window, then says Saved.", async (tone) => {
    const settings = { venueId: "bar-1", pickWindows: { ncaaf: DEFAULT_PICK_WINDOW } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, settings }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { onSaved } = renderPanel(tone);

    const save = screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Set days" })[0]);
    expect(screen.getByLabelText("College Football opens time")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save pick windows" }));

    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/${tone}/game-settings`);
    expect(JSON.parse(String(init.body))).toEqual({ venueId: "bar-1", pickWindows: { ncaaf: DEFAULT_PICK_WINDOW } });
    expect(onSaved).toHaveBeenCalledWith(settings);
  });

  it("Always open on a saved sport clears it (null)", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, settings: { pickWindows: {} } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("admin", { nfl: DEFAULT_PICK_WINDOW });
    fireEvent.click(screen.getAllByRole("button", { name: "Always open" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Save pick windows" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).pickWindows).toEqual({ nfl: null });
  });

  it("shows the server's error and keeps the draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "Pick windows are not available yet." }), { status: 500 })),
    );
    renderPanel("owner");
    fireEvent.click(screen.getAllByRole("button", { name: "Set days" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save pick windows" }));
    await waitFor(() => expect(screen.getByText("Pick windows are not available yet.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Save pick windows" })).toBeTruthy();
  });

  it("owner: a 401 hands the code back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "OWNER_SESSION_EXPIRED" }), { status: 401 })),
    );
    const { onUnauthorized } = renderPanel("owner");
    fireEvent.click(screen.getAllByRole("button", { name: "Set days" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save pick windows" }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledWith("OWNER_SESSION_EXPIRED"));
  });
});
