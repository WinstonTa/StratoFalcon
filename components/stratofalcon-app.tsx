"use client";

import { useEffect, useState } from "react";

import { DestinationGallery } from "@/components/destination-gallery";
import { FlightDeck } from "@/components/flight-deck";
import { useSimStore } from "@/lib/sim/store";

/**
 * Top-level screen switch. `idle` shows the gallery; every other phase belongs
 * to the flight deck.
 *
 * `?dry=1` is a dry run: the flight deck renders with keys, HUD and mission log
 * but never connects to Orbis, so the UI can be checked without spending
 * Reactor credits.
 */
export function StratoFalconApp() {
  const phase = useSimStore((store) => store.phase);
  const destination = useSimStore((store) => store.destination);
  const [dryRun, setDryRun] = useState(false);

  useEffect(() => {
    setDryRun(new URLSearchParams(window.location.search).get("dry") === "1");
  }, []);

  if (phase === "idle" || !destination) {
    return <DestinationGallery dryRun={dryRun} />;
  }

  return <FlightDeck dryRun={dryRun} />;
}
