"use client";

import { useEffect, useState } from "react";

import { DestinationGallery } from "@/components/destination-gallery";
import { FlightDeck } from "@/components/flight-deck";
import { useSimStore } from "@/lib/sim/store";

/**
 * `?dry=1` is a dry run: the flight deck renders with keys, HUD and mission log
 * but never connects to Orbis, so the UI can be checked without spending
 * Reactor credits. Read straight from the URL, synchronously, every time: a
 * remounted deck must never see a stale `false` and open a paid session.
 */
export function readDryRunFlag() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("dry") === "1";
}

/**
 * Top-level screen switch. `idle` shows the gallery; every other phase belongs
 * to the flight deck.
 */
export function StratoFalconApp() {
  const phase = useSimStore((store) => store.phase);
  const destination = useSimStore((store) => store.destination);
  // The gallery is server-rendered, so its badge is set after hydration. The
  // deck is client-only and reads the flag synchronously below.
  const [dryBadge, setDryBadge] = useState(false);

  useEffect(() => {
    setDryBadge(readDryRunFlag());
  }, []);

  if (phase === "idle" || !destination) {
    return <DestinationGallery dryRun={dryBadge} />;
  }

  return <FlightDeck dryRun={readDryRunFlag()} />;
}
