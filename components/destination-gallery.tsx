"use client";

import Link from "next/link";
import { type ChangeEvent, useState } from "react";

import { ORBIS_MODEL_NAME } from "@/lib/orbis";
import { requestKickoff, requestSeed } from "@/lib/sim/client";
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

// The photo is cropped and re-encoded in the browser before anything is
// uploaded, so the 10 MB limit of the routes applies to the small cropped
// JPEG. This guard only keeps absurd files away from the decoder.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// HEIC from phones is rejected by the routes and cannot be decoded by Chrome.
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** If Gemini has not named the place by then, fly with a generic kickoff. */
const KICKOFF_TIMEOUT_MS = 20_000;
const SEED_WIDTH = 1280;
const SEED_HEIGHT = 720;

/**
 * Orbis resizes start images to 16:9 without cropping, so anything else comes
 * out stretched. Centre-crop the photo to 1280×720 in the browser first.
 */
async function cropTo16by9(file: Blob): Promise<Blob> {
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

function withTimeout<T>(promise: Promise<T>, ms: number, what: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${ms / 1000} s`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Runs after the flight has started: asks for a street-level view of the same
 * place and its tour kickoff, then unlocks Land. On failure Land stays
 * disabled with a hint; the flight itself is unaffected.
 */
async function prepareGroundView(id: string, aerial: Blob, placeName: string) {
  const isCurrent = () => useSimStore.getState().destination?.id === id;
  try {
    const raw = await requestSeed(aerial, "ground", placeName);
    const ground = await cropTo16by9(raw);
    let groundKickoff: string;
    try {
      groundKickoff = (await requestKickoff(ground, "tour", placeName)).prompt;
    } catch {
      groundKickoff = "";
    }
    if (!groundKickoff?.trim()) {
      groundKickoff = compileKickoff(placeName, {
        ...INITIAL_STATE,
        mode: "tour",
      });
    }
    if (!isCurrent()) return;
    const store = useSimStore.getState();
    store.updateDestination(id, {
      groundImage: URL.createObjectURL(ground),
      groundKickoff,
    });
    store.setGroundStatus(id, "ready");
    store.log("system", "Ground view ready. Land is available");
  } catch (caught) {
    if (!isCurrent()) return;
    const store = useSimStore.getState();
    store.setGroundStatus(id, "failed");
    store.log(
      "system",
      `Ground view failed, Land is unavailable: ${
        caught instanceof Error ? caught.message : String(caught)
      }`,
    );
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
  // Non-empty while an uploaded photo is being prepared; it is the step label.
  const [preparing, setPreparing] = useState("");
  const [preview, setPreview] = useState("");

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError("");

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError(
        "Choose a JPEG, PNG or WebP photo. HEIC photos from a phone are not supported.",
      );
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("That photo is over 25 MB. Choose a smaller one.");
      return;
    }

    setPreparing("Preparing the photo");
    let previewUrl = "";
    let handedOver = false;
    try {
      const cropped = await cropTo16by9(file);
      previewUrl = URL.createObjectURL(cropped);
      setPreview(previewUrl);

      // Gemini names the place and writes the kickoff prompt. If that fails
      // or is slow, fly anyway with a generic compiled kickoff.
      setPreparing("Recognising the place");
      let name = "Your photo";
      let aerialKickoff = compileKickoff("this place", INITIAL_STATE);
      let guideFacts: string[] = [];
      let note = "";
      try {
        const kickoff = await withTimeout(
          requestKickoff(cropped, "flight"),
          KICKOFF_TIMEOUT_MS,
          "Recognising the place",
        );
        if (kickoff.name?.trim()) name = kickoff.name.trim();
        if (kickoff.prompt?.trim()) aerialKickoff = kickoff.prompt.trim();
        if (Array.isArray(kickoff.guideFacts)) guideFacts = kickoff.guideFacts;
      } catch (caught) {
        note = caught instanceof Error ? caught.message : String(caught);
      }

      const id = `upload-${Date.now()}`;
      beginFlight({
        id,
        name,
        tagline: file.name,
        aerialImage: previewUrl,
        // Empty until prepareGroundView delivers; Land stays disabled till then.
        groundImage: "",
        groundKickoff: "",
        aerialKickoff,
        guideFacts,
      });
      handedOver = true;
      const store = useSimStore.getState();
      if (note) {
        store.log(
          "system",
          `Could not recognise the photo (${note}). Using a generic kickoff prompt`,
        );
      } else {
        store.log("gemini", `Recognised the photo as ${name}`);
      }
      store.log("system", "Preparing the ground view in the background");
      void prepareGroundView(
        id,
        cropped,
        name === "Your photo" ? "this place" : name,
      );
    } catch (caught) {
      if (previewUrl && !handedOver) URL.revokeObjectURL(previewUrl);
      setUploadError(
        caught instanceof Error
          ? `Could not read that photo: ${caught.message}`
          : "Could not read that photo.",
      );
    } finally {
      setPreparing("");
      setPreview("");
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
            accept={ACCEPTED_TYPES.join(",")}
            disabled={Boolean(preparing)}
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
              {preparing ? `${preparing}…` : "Upload your own photo"}
            </span>
            <span className="dest-tagline">
              Any place you have a picture of. JPEG, PNG or WebP, cropped to
              16:9 for takeoff.
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

      {preparing && (
        <div className="upload-overlay" role="status" aria-live="polite">
          {preview && <img className="launch-backdrop" src={preview} alt="" />}
          <div className="launch-panel">
            <p className="kicker">Your photo</p>
            <h2>{preparing}…</h2>
            <p className="gallery-lede">
              Gemini is working out where this is and writing the flight
              prompt. Takeoff follows in a few seconds.
            </p>
          </div>
        </div>
      )}

      <footer className="gallery-foot">
        <span>W S A D to fly · Space to level · R F for speed</span>
        <Link href="/starter">Orbis starter (debug)</Link>
      </footer>
    </main>
  );
}
