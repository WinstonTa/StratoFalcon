"use client";

import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";

import { CommandBar } from "@/components/command-bar";
import { destinationCode } from "@/components/destination-gallery";
import { FlightHud, FlightKeys, TurnSense } from "@/components/flight-hud";
import { MissionLog } from "@/components/mission-log";
import { SituationPanel } from "@/components/situation-panel";
import { CHUNK_MS, hasPendingSteer } from "@/hooks/steer-pacer";
import { useFlightControls } from "@/hooks/use-flight-controls";
import { cancelGuideSpeech, useGuide } from "@/hooks/use-guide";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { useReactorJwt } from "@/hooks/use-reactor-jwt";
import { useSteerScheduler } from "@/hooks/use-steer-scheduler";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS } from "@/lib/orbis";
import { useSimStore } from "@/lib/sim/store";
import type { SimMode } from "@/lib/sim/types";

const MODEL_LABEL = ORBIS_MODEL_NAME.split("/").pop() ?? ORBIS_MODEL_NAME;

const LAUNCH_STEPS = [
  "Connect to Orbis",
  "Upload seed image",
  "Start generation",
  "First frames",
] as const;

/** The descent is shown for about two chunks before the view switches. */
const DESCENT_MS = 2 * CHUNK_MS + 300;
/** Longest wait for the descent prompt to leave (one pacing gap plus slack). */
const DESCENT_SEND_TIMEOUT_MS = 2600;
/**
 * Lighter to deliver than the 2k default and a match for a projector. Only
 * requested when the session reports it in state.available_resolutions.
 */
const PREFERRED_RESOLUTION = "1080p";
/** Lift an overlay anyway if a started run never reports frames. */
const FRAME_REPORT_TIMEOUT_MS = 15_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Loads a seed image into a File. Resolves null when it is missing. */
async function fetchSeedImage(url: string, name: string): Promise<File | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
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
    return new File([blob], `${name}.${extension}`, { type: blob.type });
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

interface SeedInUse {
  image: File | null;
  prompt: string;
  audioPrompt?: string;
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
  const mode = useSimStore((store) => store.state.mode);
  const setPhase = useSimStore((store) => store.setPhase);
  const log = useSimStore((store) => store.log);
  const markPromptApplied = useSimStore((store) => store.markPromptApplied);
  const resetSim = useSimStore((store) => store.reset);

  const [launchError, setLaunchError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [ending, setEnding] = useState(false);
  // False from the moment a view change begins until the new run has been
  // started, so frames from the outgoing run cannot lift the overlay.
  const [armed, setArmed] = useState(true);
  // Landing has two parts: a steered descent, then the overlay and the switch.
  const [landingStage, setLandingStage] = useState<"descent" | "switch">(
    "descent",
  );
  const [restarting, setRestarting] = useState(false);
  const [guideVoice, setGuideVoice] = useState(true);

  const connectRequested = useRef(false);
  const launchedAttempt = useRef(-1);
  const everConnected = useRef(false);
  const endingRef = useRef(false);
  const seedInUse = useRef<SeedInUse | null>(null);
  const kickoffInUse = useRef("");
  const restartingRef = useRef(false);

  const { connected, status, hasFrames, runComplete, runStarted } = session;
  const flying = phase === "flying";
  const touring = phase === "touring";
  const live = (flying || touring) && !restarting;
  const descending = phase === "landing" && landingStage === "descent";
  // An overlay is waiting for the first frames of a new run.
  const awaitingFrames =
    phase === "preparing" || (phase === "landing" && landingStage === "switch");
  const groundStatus = useSimStore((store) => store.groundStatus);
  const groundReady =
    groundStatus === "ready" && Boolean(destination?.groundImage);

  /**
   * Start the stream for one view from its seed image and kickoff prompt.
   * `withReset` is for every start after the first: landing, takeoff, retry.
   */
  const launchView = async (view: SimMode, withReset: boolean) => {
    const current = useSimStore.getState().destination;
    if (!current) return false;
    const url = view === "flight" ? current.aerialImage : current.groundImage;
    const prompt =
      view === "flight" ? current.aerialKickoff : current.groundKickoff;

    setLaunchError("");
    const image = await fetchSeedImage(
      url,
      `${current.id}-${view === "flight" ? "aerial" : "ground"}`,
    );
    if (!image) {
      log("system", "Seed image unavailable. Starting from the text prompt only");
    }
    seedInUse.current = { image, prompt, audioPrompt: current.audioPrompt };
    kickoffInUse.current = prompt;
    log("prompt", prompt, "pending");

    const options = {
      audioPrompt: current.audioPrompt,
      preferResolution: PREFERRED_RESOLUTION,
    };
    const started = withReset
      ? await session.transitionTo(image, prompt, options)
      : await session.startFlight(image, prompt, options);
    if (started) setArmed(true);
    else log("system", "Orbis did not start the run");
    return started;
  };

  const land = async () => {
    const store = useSimStore.getState();
    if (store.phase !== "flying" || restartingRef.current) return;
    if (!store.destination?.groundImage || store.groundStatus !== "ready") {
      return;
    }

    log("input", "L · Land");
    cancelGuideSpeech();
    setLandingStage("descent");
    setPhase("landing");
    // The scheduler keeps running through the descent. Wait until the descent
    // prompt has actually left (it may be held for pacing), then give it two
    // chunks on screen before the switch.
    store.applyDelta({ flight: { pitch: "descend", bank: "level" } });
    const sendDeadline = Date.now() + DESCENT_SEND_TIMEOUT_MS;
    while (hasPendingSteer() && Date.now() < sendDeadline) await sleep(100);
    await sleep(DESCENT_MS);
    if (endingRef.current || useSimStore.getState().phase !== "landing") return;

    setArmed(false);
    setLandingStage("switch");
    useSimStore.getState().enterMode("tour");
    log("system", "Touchdown. Switching to the street view");

    if (dryRun) {
      await sleep(1200);
      if (endingRef.current) return;
      setPhase("touring");
      log("system", "Dry run: on the ground. No stream was started");
      return;
    }
    await launchView("tour", true);
  };

  const takeOff = async () => {
    const store = useSimStore.getState();
    if (store.phase !== "touring" || restartingRef.current) return;

    log("input", "T · Take off");
    cancelGuideSpeech();
    setArmed(false);
    store.enterMode("flight");
    setPhase("preparing");
    log("system", "Taking off. Switching to the aerial view");
    // A dry run is carried to "flying" by its own effect below.
    if (!dryRun) await launchView("flight", true);
  };

  // Keyboard focus lives on the deck itself. After any click on a button the
  // focus comes straight back here, so W/A/S/D always steer; only the command
  // box is allowed to keep it.
  const deckRef = useRef<HTMLElement>(null);
  const refocusDeck = (target: EventTarget | null) => {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    deckRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    ) {
      return;
    }
    deckRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // Keys and gauges are local: they respond on the same frame as the press.
  useFlightControls(live, {
    onLand: () => void land(),
    onTakeOff: () => void takeOff(),
  });
  // State changes reach Orbis one sentence per chunk boundary.
  useSteerScheduler({
    enabled: (live || descending) && (dryRun || connected),
    dryRun,
  });
  // The Gemini guide narrates while the picture is live.
  const guide = useGuide({ enabled: live, voiceOn: guideVoice });

  // 1. Connect once when the deck opens.
  useEffect(() => {
    if (dryRun || connectRequested.current) return;
    connectRequested.current = true;
    log("system", `Connecting to ${MODEL_LABEL}`);
    void session.connectSession();
    // Runs once per mount; the session actions are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dryRun]);

  // 2. Once the session is ready, start the current view. A retry bumps
  //    `attempt` and comes back through here with a reset first.
  useEffect(() => {
    if (dryRun || !connected) return;
    if (launchedAttempt.current === attempt) return;
    launchedAttempt.current = attempt;
    everConnected.current = true;
    log("system", "Session ready. Loading the seed image");
    void launchView(useSimStore.getState().state.mode, attempt > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, connected, dryRun]);

  // 3. First real frames of a new run: lift the overlay, hand over controls.
  useEffect(() => {
    if (!hasFrames || !armed || !awaitingFrames) return;
    const next = useSimStore.getState().state.mode === "tour" ? "touring" : "flying";
    setPhase(next);
    markPromptApplied(kickoffInUse.current);
    log(
      "system",
      next === "touring"
        ? "On the ground. Walk, look around, or take off again"
        : "Video live. You have the controls",
    );
  }, [armed, awaitingFrames, hasFrames, log, markPromptApplied, setPhase]);

  // Safety net: if a run started but no chunk ever reports frames, do not
  // leave the overlay covering a stream that may well be playing underneath.
  useEffect(() => {
    if (dryRun || !runStarted || !armed || !awaitingFrames) return;
    const timer = setTimeout(() => {
      setPhase(
        useSimStore.getState().state.mode === "tour" ? "touring" : "flying",
      );
      log(
        "system",
        "No frame report from Orbis after 15 s. Showing the stream anyway",
      );
    }, FRAME_REPORT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed, awaitingFrames, dryRun, log, runStarted, setPhase]);

  // Dry run: no session, so go straight to the controls after a short beat.
  useEffect(() => {
    if (!dryRun || phase !== "preparing") return;
    const timer = setTimeout(() => {
      setArmed(true);
      setPhase("flying");
      log(
        "system",
        "Dry run: no Orbis session. Prompts are logged but not sent",
      );
    }, 900);
    return () => clearTimeout(timer);
  }, [dryRun, log, phase, setPhase]);

  // 4. Run limit (generation_complete): restart the same view by itself.
  useEffect(() => {
    if (!runComplete || endingRef.current || restartingRef.current) return;
    if (phase !== "flying" && phase !== "touring") return;
    const seed = seedInUse.current;
    if (!seed) return;

    restartingRef.current = true;
    setRestarting(true);
    setArmed(false);
    cancelGuideSpeech();
    log("system", "Run limit reached. Restarting the stream");
    // Orbis is back at the kickoff prompt, so every change is pending again.
    useSimStore.getState().resyncLastSent();
    log("prompt", seed.prompt, "pending");

    void session
      .restartRun(seed.image, seed.prompt, {
        audioPrompt: seed.audioPrompt,
        preferResolution: PREFERRED_RESOLUTION,
      })
      .then((restarted) => {
        if (restarted) {
          setArmed(true);
          return;
        }
        restartingRef.current = false;
        setRestarting(false);
        setPhase("ended");
        setLaunchError(
          "Orbis reached its run limit and the stream could not be restarted.",
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runComplete]);

  // The restarted run is showing frames (or has had long enough to).
  useEffect(() => {
    if (!restarting || !armed) return;
    const finish = (note: string) => {
      restartingRef.current = false;
      setRestarting(false);
      markPromptApplied(kickoffInUse.current);
      log("system", note);
    };
    if (hasFrames) {
      finish("Stream restarted");
      return;
    }
    const timer = setTimeout(
      () => finish("No frame report after the restart. Showing the stream anyway"),
      FRAME_REPORT_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [armed, hasFrames, log, markPromptApplied, restarting]);

  // 5. The session ended underneath us.
  useEffect(() => {
    if (endingRef.current) return;
    if (everConnected.current && status === "disconnected" && phase !== "ended") {
      setPhase("ended");
      setLaunchError("The Orbis session ended.");
      log("system", "Session disconnected");
    }
  }, [log, phase, setPhase, status]);

  // Leaving the deck for any reason silences the guide.
  useEffect(() => cancelGuideSpeech, []);

  if (!destination) return null;

  const endFlight = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    cancelGuideSpeech();
    try {
      if (!dryRun && status !== "disconnected") {
        await session.disconnectSession();
      }
    } finally {
      for (const url of [destination.aerialImage, destination.groundImage]) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      // Unmounting the provider tears the Reactor instance down as a backstop.
      resetSim();
    }
  };

  const retry = () => {
    setLaunchError("");
    session.clearError();
    if (connected) {
      setArmed(false);
      setAttempt((current) => current + 1);
    } else {
      launchedAttempt.current = -1;
      log("system", `Reconnecting to ${MODEL_LABEL}`);
      void session.connectSession();
    }
  };

  const errorText = launchError || session.error;
  const showVideo = !dryRun && connected && runStarted;
  const showOverlay = awaitingFrames || phase === "ended" || restarting;
  const launchStep = !connected ? 0 : !runStarted ? (session.imageStatus ? 2 : 1) : 3;
  const statusLabel = dryRun ? "dry run" : status;
  const overlayImage =
    mode === "tour" && destination.groundImage
      ? destination.groundImage
      : destination.aerialImage;
  const overlayKicker = errorText
    ? "Flight interrupted"
    : phase === "ended"
      ? "Flight ended"
      : restarting
        ? "Restarting the stream"
        : phase === "landing"
          ? "Landing"
          : attempt === 0 && !everConnected.current
            ? "Preparing for takeoff"
            : "Taking off";
  const landHint =
    mode !== "flight" || groundReady
      ? undefined
      : groundStatus === "failed"
        ? "Ground view unavailable"
        : "Preparing ground view";

  return (
    <main
      ref={deckRef}
      className="deck"
      tabIndex={-1}
      onClick={(event) => refocusDeck(event.target)}
    >
      <header className="deck-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">StratoFalcon</span>
        </div>
        <div className="deck-route">
          <span className="deck-route-code">{destinationCode(destination)}</span>
          <span className="deck-route-name">{destination.name}</span>
          <span className="deck-route-mode">
            {mode === "tour" ? "On foot" : "In flight"}
          </span>
        </div>
        <div className="deck-bar-right">
          <span className={`deck-status deck-status-${status}`}>
            <span className="deck-status-dot" aria-hidden="true" />
            {statusLabel}
          </span>
          <span className="deck-model">{MODEL_LABEL}</span>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            aria-pressed={guideVoice}
            onClick={(event) => {
              event.currentTarget.blur();
              setGuideVoice((current) => !current);
            }}
          >
            {guideVoice ? "Guide voice on" : "Guide voice off"}
          </button>
          {!dryRun && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={(event) => {
                event.currentTarget.blur();
                session.toggleMuted();
              }}
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
              <div className="video-layer">
                {dryRun && (
                  <img
                    className="video-still"
                    src={overlayImage}
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

              {(live || descending) && <FlightHud />}
              {descending && (
                <p className="viewport-banner">Final approach</p>
              )}
              {live && guide.caption && (
                <p className="guide-caption">
                  <span>Guide</span>
                  {guide.caption}
                </p>
              )}

              {showOverlay && (
                <div
                  className="launch-overlay"
                  role="status"
                  aria-live="polite"
                >
                  <img
                    className="launch-backdrop"
                    src={overlayImage}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="launch-panel">
                    <p className="kicker">{overlayKicker}</p>
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

              {!showOverlay && errorText && (
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
            <FlightKeys
              disabled={!live}
              onLand={() => void land()}
              onTakeOff={() => void takeOff()}
              landHint={landHint}
            />
            <SituationPanel disabled={!live} />
            <CommandBar disabled={!live} />
            <TurnSense />
          </div>
        </section>
        <MissionLog />
      </div>
    </main>
  );
}
