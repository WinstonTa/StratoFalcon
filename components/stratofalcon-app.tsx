"use client";

import { useEffect, useState } from "react";

import { DestinationGallery } from "@/components/destination-gallery";
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
  const reset = useSimStore((store) => store.reset);
  const [dryRun, setDryRun] = useState(false);

  useEffect(() => {
    setDryRun(new URLSearchParams(window.location.search).get("dry") === "1");
  }, []);

  if (phase === "idle" || !destination) {
    return <DestinationGallery dryRun={dryRun} />;
  }

  // Placeholder until the flight deck lands in the next commit.
  return (
    <main className="gallery">
      <section className="gallery-hero">
        <p className="kicker">Preparing</p>
        <h1>{destination.name}</h1>
        <p className="gallery-lede">The flight deck is not wired up yet.</p>
        <button type="button" className="btn" onClick={reset}>
          Back to gallery
        </button>
      </section>
    </main>
  );
}
