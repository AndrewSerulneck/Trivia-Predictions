"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { PlayerPanel } from "@/lib/playerViewState";
import { VENUE_PANEL_PARAM, venuePanelFromSearch } from "@/lib/pushLanding";

// `?panel=games|prizes` from a push (lib/pushLanding.ts, away-mode plan Phase C2): shows that Venue Home screen,
// then drops the param so a reload or a swipe behaves normally. Uses useSearchParams so a push tapped while
// Venue Home is already open still moves it; the host wraps it in its own <Suspense>.

const dropPanelParam = (): void => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(VENUE_PANEL_PARAM)) return;
  url.searchParams.delete(VENUE_PANEL_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
};

export const VenuePanelFromUrl = ({ onPanel }: { onPanel: (panel: PlayerPanel) => void }) => {
  const searchParams = useSearchParams();
  const panel = venuePanelFromSearch(searchParams.toString());

  useEffect(() => {
    if (panel === null) return;
    onPanel(panel);
    dropPanelParam();
  }, [panel, onPanel]);

  return null;
};
