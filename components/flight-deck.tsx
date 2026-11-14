"use client";

import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";

import { CommandBar } from "@/components/command-bar";
import { destinationCode } from "@/components/destination-gallery";
import {
  FlightHud,
  FlightKeys,
  useVideoFeedbackStyle,
} from "@/components/flight-hud";
import { MissionLog } from "@/components/mission-log";
import { SituationPanel } from "@/components/situation-panel";
import {
  useAltitudeBands,
  useFlightControls,
} from "@/hooks/use-flight-controls";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { useReactorJwt } from "@/hooks/use-reactor-jwt";
import { useSteerScheduler } from "@/hooks/use-steer-scheduler";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS } from "@/lib/orbis";
import { useSimStore } from "@/lib/sim/store";
import type { Destination } from "@/lib/sim/types";

const MODEL_LABEL = ORBIS_MODEL_NAME.split("/").pop() ?? ORBIS_MODEL_NAME;

const LAUNCH_STEPS = [
  "Connect to Orbis",
  "Upload seed image",
  "Start generation",
  "First frames",
] as const;

/** Loads the seed image into a File. Resolves null when it is missing. */
async function fetchSeedImage(destination: Destination): Promise<File | null> {
  try {
    const response = await fetch(destination.aerialImage);
    if (!response.ok) return null;
    const blob = await response.blob();
    // A missing public file can come back as an HTML error page.
    if (!blob.type.startsWith("image/")) return null;
    const extension =
      blob.type === "image/png"
        ? "png"
        : blob.type === "image/webp"
          ? "webp"
          : "jpg";
    return new File([blob], `${destination.id}-aerial.${extension}`, {
      type: blob.type,
    });
  } catch {
    return null;
  }
}

export function FlightDeck({ dryRun }: { dryRun: boolean }) {
  const { getJwt, getCurrentJwt, clearJwt } = useReactorJwt();

  // autoConnect stays off: the session below connects exactly once, and a dry
  // run never connects at all.
  return (
    <ReactorProvider
      apiUrl="https://api.reactor.inc"
      modelName={ORBIS_MODEL_NAME}
      modelTracks={[...ORBIS_TRACKS]}
      connectOptions={{ autoConnect: false }}
      jwtToken={getJwt}
    >
      <FlightSession
        clearJwt={clearJwt}
        getCurrentJwt={getCurrentJwt}
        dryRun={dryRun}
      />
    </ReactorProvider>
  );
}

function FlightSession({
  clearJwt,
  getCurrentJwt,
  dryRun,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
  dryRun: boolean;
}) {
  const session = useOrbisSession(clearJwt, getCurrentJwt);
  const destination = useSimStore((store) => store.destination);
  const phase = useSimStore((store) => store.phase);
  const setPhase = useSimStore((store) => store.setPhase);
  const log = useSimStore((store) => store.log);
  const markPromptApplied = useSimStore((store) => store.markPromptApplied);
  const resetSim = useSimStore((store) => store.reset);

  const [launchError, setLaunchError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [ending, setEnding] = useState(false);
  const connectRequested = useRef(false);
  const launchedAttempt = useRef(-1);
  const everConnected = useRef(false);
  const endingRef = useRef(false);

  const { connected, status, hasFrames, runComplete } = session;
  const flying = phase === "flying";

  // Keys and gauges are local: they respond on the same frame as the press.
  useFlightControls(flying);
  useAltitudeBands(flying);
  const feedbackStyle = useVideoFeedbackStyle();
  // State changes reach Orbis one sentence per chunk boundary.
  useSteerScheduler({ enabled: flying && (dryRun || connected), dryRun });

  // 1. Connect once when the deck opens.
  useEffect(() => {
    if (dryRun || connectRequested.current) return;
    connectRequested.current = true;
    log("system", `Connecting to ${MODEL_LABEL}`);
    void session.connectSession();
    // Runs once per mount; the session actions are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dryRun]);

  // 2. Once the session is ready, load the seed image and start the run.
  useEffect(() => {
    if (dryRun || !connected || !destination) return;
    if (launchedAttempt.current === attempt) return;
    launchedAttempt.current = attempt;
    everConnected.current = true;

    void (async () => {
      setLaunchError("");
      log("system", "Session ready. Loading the seed image");
      const image = await fetchSeedImage(destination);
      if (!image) {
        log(
          "system",
          "Seed image unavailable. Starting from the text prompt only",
        );
      }
      log("prompt", destination.aerialKickoff, "pending");
      const started = await session.startFlight(
        image,
        destination.aerialKickoff,
        { audioPrompt: destination.audioPrompt },
      );
      if (!started) log("system", "Orbis did not start the run");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, connected, destination, dryRun]);

  // 3. First real frames: lift the overlay and hand over the controls.
  useEffect(() => {
    if (!hasFrames || phase !== "preparing" || !destination) return;
    setPhase("flying");
    markPromptApplied(destination.aerialKickoff);
    log("system", "Video live. You have the controls");
  }, [destination, hasFrames, log, markPromptApplied, phase, setPhase]);

  // Safety net: if the run started but no chunk ever reports frames, do not
  // leave the overlay covering a stream that may well be playing underneath.
  const runStarted = session.runStarted;
  useEffect(() => {
    if (dryRun || !runStarted || phase !== "preparing") return;
    const timer = setTimeout(() => {
      setPhase("flying");
      log(
        "system",
        "No frame report from Orbis after 15 s. Showing the stream anyway",
      );
    }, 15_000);
    return () => clearTimeout(timer);
  }, [dryRun, log, phase, runStarted, setPhase]);

  // Dry run: no session, so go straight to the controls after a short beat.
  useEffect(() => {
    if (!dryRun || phase !== "preparing") return;
    const timer = setTimeout(() => {
      setPhase("flying");
      log(
        "system",
        "Dry run: no Orbis session. Prompts are logged but not sent",
      );
    }, 900);
    return () => clearTimeout(timer);
  }, [dryRun, log, phase, setPhase]);

  // 4. The run or the session ended underneath us.
  useEffect(() => {
    if (endingRef.current) return;
    if (runComplete && phase !== "ended") {
      setPhase("ended");
      setLaunchError("Orbis reached its run limit for this flight.");
      log("system", "Run limit reached (generation_complete)");
    } else if (
      everConnected.current &&
      status === "disconnected" &&
      phase !== "ended"
    ) {
      setPhase("ended");
      setLaunchError("The Orbis session ended.");
      log("system", "Session disconnected");
    }
  }, [log, phase, runComplete, setPhase, status]);

  if (!destination) return null;

  const endFlight = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    try {
      if (!dryRun && status !== "disconnected") {
        await session.disconnectSession();
      }
    } finally {
      if (destination.aerialImage.startsWith("blob:")) {
        URL.revokeObjectURL(destination.aerialImage);
      }
      // Unmounting the provider tears the Reactor instance down as a backstop.
      resetSim();
    }
  };

  const retry = () => {
    setLaunchError("");
    if (connected) {
      setAttempt((current) => current + 1);
    } else {
      launchedAttempt.current = -1;
      log("system", `Reconnecting to ${MODEL_LABEL}`);
      void session.connectSession();
    }
  };

  const errorText = launchError || session.error;
  const showVideo = !dryRun && connected && session.runStarted;
  const launchStep = !connected
    ? 0
    : !session.runStarted
      ? session.imageStatus
        ? 2
        : 1
      : 3;
  const statusLabel = dryRun ? "dry run" : status;

  return (
    <main className="deck">
      <header className="deck-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">StratoFalcon</span>
        </div>
        <div className="deck-route">
          <span className="deck-route-code">{destinationCode(destination)}</span>
          <span className="deck-route-name">{destination.name}</span>
        </div>
        <div className="deck-bar-right">
          <span className={`deck-status deck-status-${status}`}>
            <span className="deck-status-dot" aria-hidden="true" />
            {statusLabel}
          </span>
          <span className="deck-model">{MODEL_LABEL}</span>
          {!dryRun && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={session.toggleMuted}
            >
              {session.muted ? "Enable sound" : "Mute"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger btn-small"
            disabled={ending}
            onClick={() => void endFlight()}
          >
            {ending ? "Ending…" : "End flight"}
          </button>
        </div>
      </header>

      <div className="deck-body">
        <section className="stage">
          <div className="viewport-wrap">
            <div className="viewport">
              <div className="video-layer" style={feedbackStyle}>
                {dryRun && (
                  <img
                    className="video-still"
                    src={destination.aerialImage}
                    alt=""
                  />
                )}
                {showVideo && (
                  <ReactorView
                    className="reactor-view"
                    track="main_video"
                    audioTrack="main_audio"
                    muted={session.muted}
                    videoObjectFit="cover"
                  />
                )}
              </div>

              {flying && <FlightHud />}

              {!flying && (
                <div
                  className="launch-overlay"
                  role="status"
                  aria-live="polite"
                >
                  <img
                    className="launch-backdrop"
                    src={destination.aerialImage}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="launch-panel">
                    <p className="kicker">
                      {errorText
                        ? "Flight interrupted"
                        : phase === "ended"
                          ? "Flight ended"
                          : "Preparing for takeoff"}
                    </p>
                    <h2>{destination.name}</h2>

                    {errorText ? (
                      <>
                        <p className="alert" role="alert">
                          {errorText}
                        </p>
                        <div className="launch-actions">
                          {phase !== "ended" && (
                            <button
                              type="button"
                              className="btn"
                              disabled={session.controlsBusy}
                              onClick={retry}
                            >
                              Retry
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={ending}
                            onClick={() => void endFlight()}
                          >
                            Back to gallery
                          </button>
                        </div>
                      </>
                    ) : (
                      <ol className="launch-steps">
                        {LAUNCH_STEPS.map((label, index) => (
                          <li
                            key={label}
                            className={
                              dryRun || index < launchStep
                                ? "is-done"
                                : index === launchStep
                                  ? "is-active"
                                  : ""
                            }
                          >
                            <span className="launch-step-mark" />
                            {label}
                            {!dryRun && index === 0 && launchStep === 0 && (
                              <em>{status}</em>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              )}

              {flying && errorText && (
                <p className="alert viewport-alert" role="alert">
                  <span>{errorText}</span>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => {
                      setLaunchError("");
                      session.clearError();
                    }}
                  >
                    ×
                  </button>
                </p>
              )}
            </div>
          </div>
          <div className="dock">
            <FlightKeys disabled={!flying} />
            <SituationPanel disabled={!flying} />
            <CommandBar disabled={!flying} />
          </div>
        </section>
        <MissionLog />
      </div>
    </main>
  );
}
