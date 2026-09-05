import React from "react";
import { createRoot } from "react-dom/client";
import { VenueHubHeaderBar } from "../../components/venue/VenueHubHeaderBar";
import { WizardFooter } from "../../components/navigation/WizardFooter";
import { ExitBackButton } from "../../components/navigation/ExitBackButton";
import { ShareActionsSheet } from "../../components/social-share/ShareActionsSheet";
import { PageShell } from "../../components/ui/PageShell";
import { ScrollRecoverySentinel } from "../../components/ui/ScrollRecoverySentinel";
import { ScrollRescueGuard } from "../../components/ui/ScrollRescueGuard";
import { NFLGameCard } from "../../components/nfl-pickem/NFLGameCard";
import { ButtonSpinner } from "../../components/ui/ButtonSpinner";

const noop = () => {};
function Fixture() {
  if (location.pathname === "/scrolled" || location.pathname === "/child") {
    return <><ScrollRecoverySentinel /><ScrollRescueGuard /><PageShell title="Activity" showUserStatus={false} backTo={{ href: "/scrolled" }}>
      {location.pathname === "/scrolled" ? <><div style={{ height: 1400 }}>Activity content</div><a href="/child">Open child</a><div style={{ height: 1600 }}>More activity</div></> : <p>Child content</p>}
    </PageShell></>;
  }
  return <>
    <VenueHubHeaderBar venueDisplayName="Test Venue" isMenuOpen={false} onOpenMenu={noop} activeScreen={0} onGoToScreen={noop} challengeBadgeCount={2} />
    <main style={{ padding: "132px 12px 12px" }}>
      <ExitBackButton onExit={noop} />
      <WizardFooter variant="inline" onBack={noop} onNext={noop} nextLabel="Continue" />
      <NFLGameCard game={{ id: "g", homeTeam: "Buffalo Bills", awayTeam: "New York Jets", startsAt: "2099-01-01", isLocked: false, status: "scheduled", homeScore: null, awayScore: null, winnerTeam: null, isThursdayGame: true, dayGroupKey: "day", dayGroupLabel: "Thursday", isThursdayNightSection: true }} isLocked={false} scoringMode="standard" onPick={noop} />
      <ShareActionsSheet imageBlob={null} onClose={noop} onRetryNativeShare={noop} />
      <button className="tp-player-hit-target tp-player-pressable" disabled>Disabled control</button>
      <button className="tp-player-hit-target tp-player-pressable" aria-busy="true" disabled><ButtonSpinner /> Saving…</button>
      <p>Selectable body text</p><input aria-label="Native input" defaultValue="Editable text" />
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
