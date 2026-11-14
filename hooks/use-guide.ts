"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestGuideLine } from "@/lib/sim/client";
import { useSimStore } from "@/lib/sim/store";

/** First line shortly after the picture arrives. */
const FIRST_LINE_MS = 1500;
/** Then roughly this often. */
const INTERVAL_MS = 20_000;
/** After a significant change, wait for the stream to show it before talking. */
const AFTER_CHANGE_MS = 4000;
/** Do not follow one line with another sooner than this. */
const MIN_GAP_MS = 8000;
/** How long a caption stays on screen. */
const CAPTION_MS = 11_000;

// While the microphone is open the guide stays silent, so voice commands do
// not pick up its speech.
let micOpen = false;

/** Called by the voice button when listening starts and stops. */
export function setGuideMicOpen(open: boolean) {
  micOpen = open;
  if (open) cancelGuideSpeech();
}

function isSpeaking() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    (window.speechSynthesis.speaking || window.speechSynthesis.pending)
  );
}

export function cancelGuideSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speak(line: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  // Never cut off a line in progress, and never talk into an open microphone.
  if (micOpen || isSpeaking()) return;
  const utterance = new SpeechSynthesisUtterance(line);
  utterance.rate = 1.02;
  window.speechSynthesis.speak(utterance);
}

/**
 * The Gemini guide: one short line when the picture arrives, then about every
 * 20 s and shortly after a significant change. Requests never overlap. Each
 * line is captioned, logged, and spoken with the browser voice when `voiceOn`.
 */
export function useGuide({
  enabled,
  voiceOn,
}: {
  enabled: boolean;
  voiceOn: boolean;
}) {
  const [caption, setCaption] = useState("");
  const inFlight = useRef(false);
  const lastLineAt = useRef(0);
  // When a request was last started, so a failing route is retried at the
  // normal cadence instead of every check.
  const lastAttemptAt = useRef(0);
  const lastError = useRef("");
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;

  const requestLine = useCallback(async () => {
    if (inFlight.current || !enabledRef.current) return;
    // Every trigger (first line, 20 s tick, after a change) obeys the same
    // rules: a minimum gap since the last line, and no new line while the
    // previous one is still being spoken or the microphone is open.
    if (Date.now() - lastLineAt.current < MIN_GAP_MS) return;
    if (micOpen || isSpeaking()) return;
    const store = useSimStore.getState();
    const destination = store.destination;
    if (!destination) return;
    const requestedMode = store.state.mode;
    lastAttemptAt.current = Date.now();

    inFlight.current = true;
    try {
      const { line } = await requestGuideLine({
        destinationName: destination.name,
        guideFacts: destination.guideFacts,
        state: store.state,
        recent: store.guideLines.slice(0, 8),
      });
      const text = line?.trim();
      const now = useSimStore.getState();
      // Drop a line that arrives after the view has gone away.
      if (!text || !enabledRef.current) return;
      if (now.destination?.id !== destination.id) return;
      // A line written for the air is wrong on the ground, and the reverse.
      if (now.state.mode !== requestedMode) return;

      now.addGuideLine(text);
      now.log("guide", text);
      setCaption(text);
      lastLineAt.current = Date.now();
      lastError.current = "";
      if (voiceRef.current) speak(text);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      // Log a repeated failure once, not every 20 s.
      if (message !== lastError.current) {
        lastError.current = message;
        useSimStore.getState().log("system", `Guide unavailable: ${message}`);
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // A new view (first frames, after landing, after takeoff) gets a line
    // promptly; the previous view's speech was cancelled on the way out.
    lastLineAt.current = 0;
    lastAttemptAt.current = 0;
    const first = setTimeout(() => void requestLine(), FIRST_LINE_MS);
    // Checked every few seconds so a tick skipped for the gap or for speech in
    // progress is picked up soon after, not a whole interval later.
    const interval = setInterval(() => {
      const now = Date.now();
      if (
        now - lastLineAt.current >= INTERVAL_MS &&
        now - lastAttemptAt.current >= INTERVAL_MS
      ) {
        void requestLine();
      }
    }, 2500);

    let afterChange: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useSimStore.subscribe((next, previous) => {
      const a = previous.state;
      const b = next.state;
      const significant =
        a.environment.weather !== b.environment.weather ||
        a.environment.timeOfDay !== b.environment.timeOfDay ||
        a.flight.altitude !== b.flight.altitude ||
        (b.event !== null && b.event.id !== a.event?.id);
      if (!significant) return;
      if (afterChange) clearTimeout(afterChange);
      afterChange = setTimeout(() => void requestLine(), AFTER_CHANGE_MS);
    });

    return () => {
      clearTimeout(first);
      clearInterval(interval);
      if (afterChange) clearTimeout(afterChange);
      unsubscribe();
      // Leaving the view (landing, takeoff, end of flight) silences the guide.
      cancelGuideSpeech();
      setCaption("");
    };
  }, [enabled, requestLine]);

  // Captions clear themselves.
  useEffect(() => {
    if (!caption) return;
    const timer = setTimeout(() => setCaption(""), CAPTION_MS);
    return () => clearTimeout(timer);
  }, [caption]);

  // Turning the voice off stops the current sentence.
  useEffect(() => {
    if (!voiceOn) cancelGuideSpeech();
  }, [voiceOn]);

  return { caption };
}
