import type { Metadata } from "next";
import { DeleteAccountPanel } from "@/components/account/DeleteAccountPanel";
import { PageShell } from "@/components/ui/PageShell";

// The signed-in player's "Delete my account" screen (native app store plan Phase 1b). Reached from
// the account menu and from the public /delete-account explainer. A game-host page: proxy.ts
// gates it like every other player page, so a visitor without a session is sent to sign in first.

export const metadata: Metadata = {
  title: "Delete your account",
  robots: { index: false, follow: false },
};

export default function DeleteAccountPage() {
  return (
    <PageShell title="" showPageTitle={false} showUserStatus={false} backTo={{ label: "Back", venueHomeFallback: true }}>
      <DeleteAccountPanel />
    </PageShell>
  );
}
