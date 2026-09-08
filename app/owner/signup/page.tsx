import { notFound } from "next/navigation";
import { SignupWizard } from "@/components/signup/SignupWizard";
import { isSelfServeSignupEnabled } from "@/lib/selfServeSignup";

// Partner Self-Serve Signup — the route. Phase 4
// (docs/partner-self-serve-signup-plan.md §4).
//
// A SERVER component whose only job is the flag gate, so that with
// NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED off this URL is a genuine 404 — the same
// answer /api/signup/maps-key and /api/signup/places give — rather than a page
// that renders and then hides itself client-side. Off is the default and is
// fully inert: /owner/register keeps today's venue-lookup flow.
//
// Everything else is <SignupWizard>, a client component: six steps of state, a
// sessionStorage draft and a Places lookup have no server half.
//
// proxy.ts already exempts all of /owner/* from the player cookie gate, so this
// route is publicly reachable with no proxy change. AppShell lists
// "/owner/signup" in FULLSCREEN_PATHS — rename this route and that list must
// move with it, or the takeover inherits the 720px clamp.

export const metadata = {
  title: "Become a partner venue",
};

export default function OwnerSignupPage() {
  if (!isSelfServeSignupEnabled()) {
    notFound();
  }
  return <SignupWizard />;
}
