// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BLANK_SIGNUP_DRAFT, SIGNUP_STEPS, type SignupDraft } from "@/lib/selfServeSignup";

/**
 * Partner Self-Serve Signup, Phase 4 (docs/self-serve-signup-review-fixes-plan.md
 * §3 Phase 4). Two "the partner is told something false" bugs:
 *
 *   #11 — a server `email_taken` 409 used to print in the review-screen footer,
 *         three steps away from the email field it is about. It must now send the
 *         wizard back to the email step with the message on that field.
 *   #4  — the duplicate-venue panel hides the WizardFooter, so its claim button
 *         is the only control on screen and was unguarded. A second tap while the
 *         first submit is in flight burns a rate-limit slot and can 409 a signup
 *         that already succeeded.
 */

const router = { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// The shell is chrome (progress rail, ExitBackButton, sticky WizardFooter,
// framer-motion step slide) — none of it is what these two bugs live in. A
// passthrough that exposes the step key/index and a Next button is all the
// wizard-state assertions need.
vi.mock("@/components/signup/SignupShell", () => ({
  SignupShell: (props: {
    stepIndex: number;
    stepKey: string;
    nextDisabled?: boolean;
    onNext?: () => void;
    footerHint?: string;
    children: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      null,
      React.createElement("span", { "data-testid": "step-key" }, props.stepKey),
      React.createElement("span", { "data-testid": "step-index" }, String(props.stepIndex)),
      React.createElement("span", { "data-testid": "footer-hint" }, props.footerHint ?? ""),
      props.onNext
        ? React.createElement(
            "button",
            { type: "button", "data-testid": "shell-next", onClick: props.onNext },
            "Next"
          )
        : null,
      props.children
    ),
}));

// The address and geofence steps mount Google Maps widgets that jsdom cannot
// run. Their content is irrelevant here — the draft is pre-seeded valid.
vi.mock("@/components/signup/steps/AddressStep", () => ({ AddressStep: () => null }));
vi.mock("@/components/signup/steps/GeofenceStep", () => ({ GeofenceStep: () => null }));

const draft: SignupDraft = {
  ...BLANK_SIGNUP_DRAFT,
  name: "Alex Rivera",
  email: "alex@thecorner.example",
  password: "correct-horse",
  venueName: "The Corner Tap",
  street: "12 Main St",
  city: "Denver",
  state: "CO",
  zipCode: "80202",
  latitude: 39.7392,
  longitude: -104.9903,
};

vi.mock("@/components/signup/signupDraft", () => ({
  readSignupDraft: () => draft,
  writeSignupDraft: vi.fn(),
  clearSignupDraft: vi.fn(),
  signupDraftHasAnswers: () => true,
}));

import { SignupWizard } from "@/components/signup/SignupWizard";

const EMAIL_INDEX = SIGNUP_STEPS.indexOf("email");
const REVIEW_INDEX = SIGNUP_STEPS.indexOf("review");

/** Drive the shell's Next button until the wizard reaches a target step. */
const advanceTo = async (targetIndex: number) => {
  for (let i = 0; i < targetIndex + 2; i += 1) {
    if (Number(screen.getByTestId("step-index").textContent) >= targetIndex) return;
    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });
  }
};

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

const res = (status: number, body: unknown): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/**
 * Stub `fetch` with a URL-aware dispatcher, and hand back the two halves.
 *
 * The wizard now makes TWO kinds of request: the step-2 email pre-check
 * (POST /api/signup/email-available, fired on the way through the email step)
 * and the final POST /api/owner/signup. A single blanket mock would let the
 * pre-check silently consume `mockResolvedValueOnce` sequencing intended for
 * the signup POST — and the call-count assertions would drift by one every time
 * a test walks through the email step. So each half is mocked separately, and
 * the pre-check answers "available" unless a test says otherwise.
 */
type FetchHandler = (url?: unknown, init?: unknown) => unknown;

const stubFetch = (
  signup: FetchHandler,
  emailCheck: FetchHandler = vi.fn().mockResolvedValue(res(200, { ok: true, available: true }))
) => {
  const fetchMock = vi.fn((url: unknown, init?: unknown) =>
    String(url).includes("/api/signup/email-available") ? emailCheck(url, init) : signup(url, init)
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, signup, emailCheck };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.replace.mockReset();
});

describe("SignupWizard — server error routing (Finding #11)", () => {
  it("sends an email_taken 409 back to the email step with the message on that field", async () => {
    stubFetch(
      vi.fn().mockResolvedValue(
        res(409, {
          ok: false,
          code: "email_taken",
          error: "An account with this email already exists. Sign in instead, or use a different email.",
        })
      )
    );

    render(React.createElement(SignupWizard));
    await advanceTo(REVIEW_INDEX);
    expect(screen.getByTestId("step-key").textContent).toBe("review");

    // Submit from the review step.
    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("step-index").textContent).toBe(String(EMAIL_INDEX));
    });
    expect(screen.getByTestId("step-key").textContent).toBe("email");
    // On the field, not in the footer four steps away.
    expect(screen.getByRole("alert").textContent).toContain("already exists");
    expect(screen.getByTestId("footer-hint").textContent).toBe("");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("clears the email error as soon as the field is edited", async () => {
    stubFetch(
      vi.fn().mockResolvedValue(res(409, { ok: false, code: "email_taken", error: "already exists" }))
    );

    render(React.createElement(SignupWizard));
    await advanceTo(REVIEW_INDEX);
    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "alex@thecorner.example." },
      });
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SignupWizard — claim button in-flight guard (Finding #4)", () => {
  it("disables the claim button while the claim submit is pending", async () => {
    let releaseClaim!: (value: unknown) => void;
    const signupMock = vi
      .fn()
      // First submit: 409 with a claimable nearby venue → duplicate panel.
      .mockResolvedValueOnce(
        res(409, {
          ok: false,
          code: "venue_available",
          venue: { id: "venue-corner", name: "The Corner Tap", address: "12 Main St, Denver, CO" },
        })
      )
      // The claim POST: never settles, so `submitting` stays true.
      .mockImplementationOnce(
        () => new Promise((resolve) => { releaseClaim = resolve; })
      );
    stubFetch(signupMock);

    render(React.createElement(SignupWizard));
    await advanceTo(REVIEW_INDEX);
    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });

    const claimButton = (await screen.findByRole("button", {
      name: "Yes — this is my venue",
    })) as HTMLButtonElement;
    expect(claimButton.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(claimButton);
    });

    const busyButton = screen.getByRole("button", { name: "Claiming…" }) as HTMLButtonElement;
    expect(busyButton.disabled).toBe(true);
    expect(busyButton.getAttribute("aria-busy")).toBe("true");

    // A second, third tap while it is pending must not fire another request.
    await act(async () => {
      fireEvent.click(busyButton);
      fireEvent.click(busyButton);
    });
    // Only the discovery POST and one claim POST — the extra taps did nothing.
    // Counted on the signup half alone, so the step-2 email pre-check that fired
    // on the way here cannot mask a regression.
    expect(signupMock).toHaveBeenCalledTimes(2);

    releaseClaim(res(500, { ok: false }));
  });
});

/**
 * The step-2 pre-check. Before it, an email that already had a `venue_owners`
 * row was only discovered by the review screen's 409 — four steps of work later,
 * and the bounce back to step 2 read as the wizard resetting itself rather than
 * as an answer about the email. It must now refuse to leave step 2 at all.
 */
describe("SignupWizard — step-2 email availability pre-check", () => {
  const emailTakenBody = {
    ok: true,
    available: false,
    error: "An account with this email already exists. Sign in instead, or use a different email.",
  };

  it("refuses to advance past the email step and shows the reason on the field", async () => {
    const { signup } = stubFetch(
      vi.fn(),
      vi.fn().mockResolvedValue(res(200, emailTakenBody))
    );

    render(React.createElement(SignupWizard));
    await advanceTo(EMAIL_INDEX);
    expect(screen.getByTestId("step-key").textContent).toBe("email");

    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });

    // Still on step 2 — this is the whole point.
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByTestId("step-index").textContent).toBe(String(EMAIL_INDEX));
    expect(screen.getByRole("alert").textContent).toContain("already exists");
    // And an affordance that actually resolves it: self-serve is one venue per
    // email, so "try again" is not an answer.
    expect(screen.getByRole("link", { name: "Sign in to your account" })).toBeTruthy();
    // Nothing was ever submitted.
    expect(signup).not.toHaveBeenCalled();
  });

  it("advances when the email is available", async () => {
    stubFetch(vi.fn());

    render(React.createElement(SignupWizard));
    await advanceTo(EMAIL_INDEX);
    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("step-index").textContent).toBe(String(EMAIL_INDEX + 1));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the taken error and its sign-in link as soon as the field is edited", async () => {
    stubFetch(vi.fn(), vi.fn().mockResolvedValue(res(200, emailTakenBody)));

    render(React.createElement(SignupWizard));
    await advanceTo(EMAIL_INDEX);
    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "someone-else@thecorner.example" },
      });
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in to your account" })).toBeNull();
  });

  // The pre-check is UX, not a gate: POST /api/owner/signup re-runs the same
  // lookup and is the authority. A pre-check outage must not wedge the wizard.
  it.each([
    ["a 503 lookup failure", res(503, { ok: false, error: "unavailable" })],
    ["a 404 flag skew", res(404, { ok: false, error: "Not found." })],
    ["a 429 rate limit", res(429, { ok: false, error: "Too many requests." })],
  ])("fails open on %s", async (_label, response) => {
    stubFetch(vi.fn(), vi.fn().mockResolvedValue(response));

    render(React.createElement(SignupWizard));
    await advanceTo(EMAIL_INDEX);
    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("step-index").textContent).toBe(String(EMAIL_INDEX + 1));
    });
  });

  it("fails open when the pre-check request throws", async () => {
    stubFetch(vi.fn(), vi.fn().mockRejectedValue(new Error("offline")));

    render(React.createElement(SignupWizard));
    await advanceTo(EMAIL_INDEX);
    await act(async () => {
      fireEvent.click(screen.getByTestId("shell-next"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("step-index").textContent).toBe(String(EMAIL_INDEX + 1));
    });
  });
});
