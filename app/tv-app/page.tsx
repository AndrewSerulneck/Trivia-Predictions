import { TvConnectScreen } from "@/components/venue-screen/TvConnectScreen";

// /tv-app — the Hightop Challenge TV app's start page (docs/fire-tv-app-plan.md D5, Phase 3). Works in any browser:
// a remembered venue opens its display; otherwise the Connect screen. `?change=1` forgets the venue first.
export default function TvAppPage() {
  return <TvConnectScreen />;
}
