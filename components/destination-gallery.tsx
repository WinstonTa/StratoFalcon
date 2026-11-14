"use client";

import Link from "next/link";
import { type ChangeEvent, useState } from "react";

import { ORBIS_MODEL_NAME } from "@/lib/orbis";
import { DESTINATIONS } from "@/lib/sim/destinations";
import { compileKickoff, INITIAL_STATE } from "@/lib/sim/prompt-compiler";
import { useSimStore } from "@/lib/sim/store";
import type { Destination } from "@/lib/sim/types";

const AIRPORT_CODES: Record<string, string> = {
  paris: "CDG",
  tokyo: "HND",
  "los-angeles": "LAX",
  "new-york-city": "JFK",
  boston: "BOS",
  "venice-beach": "VNC",
};

export function destinationCode(destination: Destination) {
  return (
    AIRPORT_CODES[destination.id] ??
    destination.id.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase()
  );
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const SEED_WIDTH = 1280;
const SEED_HEIGHT = 720;

/**
 * Orbis resizes start images to 16:9 without cropping, so anything else comes
 * out stretched. Centre-crop the photo to 1280×720 in the browser first.
 */
async function cropTo16by9(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.max(
      SEED_WIDTH / bitmap.width,
      SEED_HEIGHT / bitmap.height,
    );
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const canvas = document.createElement("canvas");
    canvas.width = SEED_WIDTH;
    canvas.height = SEED_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the photo.");
    context.drawImage(
      bitmap,
      (SEED_WIDTH - width) / 2,
      (SEED_HEIGHT - height) / 2,
      width,
      height,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Could not encode photo.")),
        "image/jpeg",
        0.92,
      ),
    );
  } finally {
    bitmap.close();
  }
}

function DestinationCard({
  destination,
  index,
  onChoose,
}: {
  destination: Destination;
  index: number;
  onChoose: (destination: Destination) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const code = destinationCode(destination);

  return (
    <button
      type="button"
      className="dest-card"
      onClick={() => onChoose(destination)}
    >
      <span className="dest-media">
        {imageFailed ? (
          <span className="dest-placeholder" aria-hidden="true">
            {code}
          </span>
        ) : (
          // Plain <img>: preset files may be replaced or arrive late, and a
          // missing file must fall back to the placeholder, not break the card.
          <img
            src={destination.aerialImage}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </span>
      <span className="dest-meta">
        <span className="dest-gate">
          <span className="dest-code">{code}</span>
          <span className="dest-index">
            Gate {String(index + 1).padStart(2, "0")}
          </span>
        </span>
        <span className="dest-name">{destination.name}</span>
        <span className="dest-tagline">{destination.tagline}</span>
      </span>
      <span className="dest-cta">Fly</span>
    </button>
  );
}

export function DestinationGallery({ dryRun }: { dryRun: boolean }) {
  const beginFlight = useSimStore((store) => store.beginFlight);
  const [uploadError, setUploadError] = useState("");
  const [preparing, setPreparing] = useState(false);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError("");

    if (!file.type.startsWith("image/")) {
      setUploadError("That file is not an image. Choose a JPEG or PNG photo.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("That photo is over 20 MB. Choose a smaller one.");
      return;
    }

    setPreparing(true);
    try {
      const cropped = await cropTo16by9(file);
      const url = URL.createObjectURL(cropped);
      // Phase 1: fly straight from the photo with a generic compiled kickoff.
      // The Gemini-backed place recognition and ground seed arrive in Phase 3.
      beginFlight({
        id: "upload",
        name: "Your photo",
        tagline: file.name,
        aerialImage: url,
        groundImage: url,
        aerialKickoff: compileKickoff("this place", INITIAL_STATE),
        groundKickoff: compileKickoff("this place", {
          ...INITIAL_STATE,
          mode: "tour",
        }),
        guideFacts: [],
      });
    } catch (caught) {
      setUploadError(
        caught instanceof Error
          ? `Could not read that photo: ${caught.message}`
          : "Could not read that photo.",
      );
    } finally {
      setPreparing(false);
    }
  };

  return (
    <main className="gallery">
      <header className="gallery-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">StratoFalcon</span>
        </div>
        <p className="gallery-status">
          <span>Live world model</span>
          <span>{ORBIS_MODEL_NAME.split("/").pop()}</span>
          {dryRun && <span className="chip-warn">Dry run · no session</span>}
        </p>
      </header>

      <section className="dest-grid" aria-label="Destinations">
        <div className="gallery-hero">
          <p className="kicker">Departures</p>
          <h1>
            Pick anywhere.
            <br />
            Fly it live.
          </h1>
          <p className="gallery-lede">
            Every frame is generated as you fly. Choose a destination, take the
            controls, then land and walk it.
          </p>
        </div>

        {DESTINATIONS.map((destination, index) => (
          <DestinationCard
            key={destination.id}
            destination={destination}
            index={index}
            onChoose={beginFlight}
          />
        ))}

        <label className={`dest-card dest-upload${preparing ? " is-busy" : ""}`}>
          <input
            type="file"
            accept="image/*"
            disabled={preparing}
            onChange={handleUpload}
          />
          <span className="dest-media">
            <span className="dest-placeholder dest-upload-icon" aria-hidden="true">
              +
            </span>
          </span>
          <span className="dest-meta">
            <span className="dest-gate">
              <span className="dest-code">YOU</span>
              <span className="dest-index">Charter</span>
            </span>
            <span className="dest-name">
              {preparing ? "Preparing photo…" : "Upload your own photo"}
            </span>
            <span className="dest-tagline">
              Any place you have a picture of. Cropped to 16:9 for takeoff.
            </span>
          </span>
          <span className="dest-cta">Browse</span>
        </label>
      </section>

      {uploadError && (
        <p className="alert" role="alert">
          {uploadError}
        </p>
      )}

      <footer className="gallery-foot">
        <span>W S A D to fly · Space to level · R F for speed</span>
        <Link href="/starter">Orbis starter (debug)</Link>
      </footer>
    </main>
  );
}
