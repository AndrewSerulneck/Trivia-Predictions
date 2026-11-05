// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SOCIAL_POST_COPY as COPY } from "@/lib/promo/promoCopy";
import { SOCIAL_POLL_INTERVAL_MS } from "@/lib/social/socialPublishRules";

// Post now panel (docs/partner-social-promo-plan.md Phase 16). Rendered directly: the sheet doesn't mount it
// while Post now is off. createElement, not JSX (*.test.ts glob).

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

const { SocialPostNowPanel } = await import("@/components/owner/social/SocialPostNowPanel");

const status = (over: Record<string, unknown>) => ({
  ok: true,
  instagram: { state: "connected", username: "bar" },
  facebook: { state: "not_connected" },
  posts: [],
  postsLeftToday: 5,
  ...over,
});

const captionInput = {
  template: { name: "Live Trivia", hashtags: ["trivia"] },
  when: { days: "Every Thursday", time: "8 PM" },
  venueName: "The Bar",
  prizes: [],
} as never;

const props = (over: Record<string, unknown> = {}) =>
  ({
    open: true,
    venueId: "v1",
    format: "post",
    media: { blob: new Blob(["x"]), fileName: "a.jpg" },
    captionInput,
    templateId: "live_trivia",
    scheduleId: null,
    prizeIds: [],
    musicId: null,
    ...over,
  }) as never;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  search = "";
  fetchMock = vi.fn(async () => new Response(JSON.stringify(status({})), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const caption = () => screen.getByLabelText(COPY.captionLabel) as HTMLTextAreaElement;

describe("SocialPostNowPanel", () => {
  it("starts the caption from the suggestion and keeps the partner's edit", async () => {
    render(createElement(SocialPostNowPanel, props()));
    await waitFor(() => expect(caption().value).toContain("Live Trivia at The Bar"));
    fireEvent.change(caption(), { target: { value: "My words" } });
    expect(caption().value).toBe("My words");
  });

  it("flags a caption with too many hashtags and blocks posting", async () => {
    render(createElement(SocialPostNowPanel, props()));
    await waitFor(() => caption());
    fireEvent.change(caption(), { target: { value: Array.from({ length: 40 }, (_, i) => `#t${i}`).join(" ") } });
    expect(screen.getByRole("alert").textContent).toMatch(/hashtags/);
    expect((screen.getByText(COPY.postNow("Instagram", "post")) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Instagram-only caption limits block Instagram's button, not Facebook's (Phase 20)", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify(status({ facebook: { state: "connected", pageName: "The Page" } })), { status: 200 }),
    );
    render(createElement(SocialPostNowPanel, props()));
    await waitFor(() => caption());
    fireEvent.change(caption(), { target: { value: Array.from({ length: 40 }, (_, i) => `#t${i}`).join(" ") } });
    expect(screen.getByRole("alert").textContent).toMatch(/^Instagram allows/);
    expect((await screen.findByText(COPY.postNow("Instagram", "post")) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText(COPY.postNow("Facebook", "post")) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(caption(), { target: { value: "x".repeat(2201) } });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect((screen.getByText(COPY.postNow("Facebook", "post")) as HTMLButtonElement).disabled).toBe(true);
  });

  it("drops the connect params from the URL once read, keeping sheet=social (Phase 20)", async () => {
    search = "sheet=social&socialVenue=v1&socialResult=connected";
    window.history.replaceState({ depth: 2 }, "", "/owner/dashboard?sheet=social&socialVenue=v1&socialResult=connected");
    render(createElement(SocialPostNowPanel, props()));
    await waitFor(() => expect(window.location.search).toBe("?sheet=social"));
    expect(window.history.state).toEqual({ depth: 2 });
    expect(screen.getByText(COPY.results.connected)).toBeTruthy();
  });

  it("Cancel on the Disconnect confirm clears the notice (Phase 20)", async () => {
    search = "socialVenue=v1&socialResult=connected";
    render(createElement(SocialPostNowPanel, props()));
    fireEvent.click(await screen.findByText(COPY.disconnect));
    fireEvent.click(screen.getByText(COPY.cancel));
    expect(screen.queryByText(COPY.results.connected)).toBeNull();
  });

  it("has no caption box for a Story", async () => {
    render(createElement(SocialPostNowPanel, props({ format: "story" })));
    await waitFor(() => screen.getByText(COPY.postNow("Instagram", "story")));
    expect(screen.queryByLabelText(COPY.captionLabel)).toBeNull();
  });

  it("shows the connect result only for its own venue", async () => {
    search = "socialVenue=v1&socialResult=connected";
    const { unmount } = render(createElement(SocialPostNowPanel, props()));
    expect(screen.getByText(COPY.results.connected)).toBeTruthy();
    unmount();
    search = "socialVenue=other&socialResult=connected";
    render(createElement(SocialPostNowPanel, props()));
    expect(screen.queryByText(COPY.results.connected)).toBeNull();
  });

  it("choose that fails to reach the server shows the error notice", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new Error("offline");
      return new Response(
        JSON.stringify(status({ instagram: { state: "choose_account", choices: [{ instagramId: "1", username: "bar", pageName: "P" }] } })),
        { status: 200 },
      );
    });
    render(createElement(SocialPostNowPanel, props()));
    fireEvent.click(await screen.findByText("@bar"));
    expect(await screen.findByText(COPY.results.error)).toBeTruthy();
  });

  it("disconnect that fails to reach the server shows the error and keeps the confirm open", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") throw new Error("offline");
      return new Response(JSON.stringify(status({})), { status: 200 });
    });
    render(createElement(SocialPostNowPanel, props()));
    fireEvent.click(await screen.findByText(COPY.disconnect));
    fireEvent.click(screen.getAllByText(COPY.disconnect).find((el) => el.tagName === "BUTTON" && el.className.includes("rose"))!);
    expect(await screen.findByText(COPY.results.error)).toBeTruthy();
    expect(screen.getByText(COPY.disconnectConfirm("Instagram"))).toBeTruthy();
  });

  describe("Phase 19: a publish whose answer doesn't say it failed is polled, never 'try again'", () => {
    const json = (body: unknown, httpStatus = 200) => new Response(JSON.stringify(body), { status: httpStatus });
    const published = { id: "p-1", provider: "instagram", format: "post", templateId: "live_trivia", status: "published", permalink: "https://www.instagram.com/p/abc/", error: null, createdAt: "2026-11-05T12:00:00.000Z" };
    /** Create + upload succeed; `publish` answers the publish step; the poll then reads `polled` (published by default). */
    const steer = (publish: () => Promise<Response>, polled: Record<string, unknown> = published) => {
      const calls: string[] = [];
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url === "/api/owner/social/posts" && init?.method === "POST") return json({ ok: true, postId: "p-1", uploadUrl: "https://storage.test/upload" });
        if (init?.method === "PUT") return json({});
        if (url.endsWith("/publish")) return publish();
        if (url.startsWith("/api/owner/social/posts/p-1")) return json({ ok: true, post: polled });
        return json(status({}));
      });
      return calls;
    };
    const postButton = async () => (await screen.findByText(COPY.postNow("Instagram", "post"))) as HTMLButtonElement;

    it.each<[string, () => Promise<Response>]>([
      ["the route's unsure (it failed after the claim)", async () => json({ ok: false, error: "We couldn't confirm the post yet.", code: "unsure", postId: "p-1" }, 500)],
      ["no answer (the connection dropped)", async () => Promise.reject(new TypeError("Failed to fetch"))],
      ["an unreadable answer (the request was stopped mid-call)", async () => new Response("<html>504</html>", { status: 504 })],
    ])("%s: shows processing, keeps Post off, then polls the same post to its answer", async (_label, publish) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const calls = steer(publish);
      render(createElement(SocialPostNowPanel, props()));
      const button = await postButton();
      fireEvent.click(button);
      expect(await screen.findByText(COPY.processing("Instagram"))).toBeTruthy();
      expect(button.disabled).toBe(true);
      expect(screen.queryByText(COPY.errors.failed)).toBeNull();
      expect(screen.queryByText(/try again/i)).toBeNull();

      await vi.advanceTimersByTimeAsync(SOCIAL_POLL_INTERVAL_MS);
      expect(await screen.findByText(COPY.posted("Instagram"))).toBeTruthy();
      expect(calls.filter((call) => call.endsWith("/publish"))).toHaveLength(1);
      expect(calls.filter((call) => call.startsWith("POST /api/owner/social/posts") && !call.endsWith("/publish"))).toHaveLength(1);
      expect(calls).toContain("GET /api/owner/social/posts/p-1?venueId=v1");
    });

    it("a clear refusal before the claim still shows its own words", async () => {
      steer(async () => json({ ok: false, error: "The file didn't finish uploading. Please try again.", code: "not_uploaded" }, 409));
      render(createElement(SocialPostNowPanel, props()));
      fireEvent.click(await postButton());
      expect(await screen.findByText("The file didn't finish uploading. Please try again.")).toBeTruthy();
      expect((await postButton()).disabled).toBe(false);
    });

    it("no answer after the poll's 5 minutes: still waiting, and the same media can't be posted again", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const calls = steer(
        async () => json({ ok: false, error: "We couldn't confirm the post yet.", code: "unsure", postId: "p-1" }, 500),
        { ...published, status: "publishing", permalink: null },
      );
      render(createElement(SocialPostNowPanel, props()));
      const button = await postButton();
      fireEvent.click(button);
      await screen.findByText(COPY.processing("Instagram"));
      await vi.advanceTimersByTimeAsync(5 * 60_000 + SOCIAL_POLL_INTERVAL_MS);
      expect(await screen.findByText(COPY.stillProcessing("Instagram"))).toBeTruthy();
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(calls.filter((call) => call.endsWith("/publish"))).toHaveLength(1);
    });
  });
});
