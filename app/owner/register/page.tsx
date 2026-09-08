import { redirect } from "next/navigation";
import { OwnerRegisterForm } from "@/components/owner/OwnerRegisterForm";
import { isSelfServeSignupEnabled } from "@/lib/selfServeSignup";

// Partner Self-Serve Signup — Phase 7 cutover
// (docs/partner-self-serve-signup-plan.md §4).
//
// A SERVER component whose only job is the flag gate. With
// NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED on, this legacy venue-lookup page
// redirects to the self-serve `/owner/signup` wizard — so every existing link,
// bookmark and "Create an account" reference keeps working through the cutover.
// With the flag off (the default) it renders today's venue-lookup form
// unchanged.
//
// Mirrors app/owner/signup/page.tsx: the flag is a NEXT_PUBLIC_* value inlined at
// build time, so flipping the env var only takes effect on the next deploy.

export default function OwnerRegisterPage() {
  if (isSelfServeSignupEnabled()) {
    redirect("/owner/signup");
  }
  return <OwnerRegisterForm />;
}
