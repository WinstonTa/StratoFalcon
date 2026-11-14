"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requestCommand } from "@/lib/sim/client";
import { useSimStore } from "@/lib/sim/store";

const MAX_COMMAND_CHARS = 500;

/**
 * Free text and voice share this one path: POST /api/sim/command, then apply
 * the returned delta through the store. It never blocks the controls; several
 * commands may be in flight at once and each reports to the mission log.
 */
export function useCopilot() {
  const [pending, setPending] = useState(0);

  const send = useCallback(async (rawText: string, source: "typed" | "voice") => {
    const text = rawText.trim().slice(0, MAX_COMMAND_CHARS);
    if (!text) return;

    const before = useSimStore.getState();
    const destination = before.destination;
    if (!destination) return;
    before.log("input", `${source === "voice" ? "Voice" : "Typed"} · “${text}”`);

    setPending((count) => count + 1);
    try {
      const { delta, say } = await requestCommand({
        text,
        state: before.state,
        destinationName: destination.name,
      });
      const now = useSimStore.getState();
      // The flight may have ended while Gemini was thinking.
      if (now.destination?.id !== destination.id) return;
      if (say) now.log("gemini", say);
      now.applyDelta(delta ?? {});
    } catch (caught) {
      useSimStore
        .getState()
        .log(
          "system",
          `Co-pilot error: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
    } finally {
      setPending((count) => Math.max(0, count - 1));
    }
  }, []);

  return { send, pending };
}

// ---------------------------------------------------------------------------
// Voice: the browser's speech recognition (Chrome ships it as
// webkitSpeechRecognition). TypeScript's DOM library does not type it.
// ---------------------------------------------------------------------------

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  0: RecognitionAlternative;
  isFinal: boolean;
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionConstructor = new () => Recognition;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const VOICE_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked for this page",
  "service-not-allowed": "Microphone access is blocked for this page",
  "audio-capture": "No microphone was found",
  "no-speech": "No speech heard",
  network: "Voice recognition needs a network connection",
};

/**
 * Push-to-talk. `start` on press, `stop` on release; the transcript heard in
 * between is handed to `onFinal` once the recogniser has finished.
 */
export function useVoiceCommand(onFinal: (text: string) => void) {
  // null until checked on the client, so server and first client render agree.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const transcript = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(getRecognitionConstructor() !== null);
    return () => recognition.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Constructor = getRecognitionConstructor();
    if (!Constructor || recognition.current) return;

    const instance = new Constructor();
    instance.lang = "en-US";
    instance.continuous = true;
    instance.interimResults = true;
    transcript.current = "";
    setError("");
    setInterim("");

    instance.onresult = (event) => {
      let heard = "";
      for (let index = 0; index < event.results.length; index += 1) {
        heard += event.results[index][0].transcript;
      }
      transcript.current = heard;
      setInterim(heard.trim());
    };
    instance.onerror = (event) => {
      if (event.error === "aborted") return;
      setError(VOICE_ERRORS[event.error] ?? `Voice error: ${event.error}`);
    };
    instance.onend = () => {
      recognition.current = null;
      setListening(false);
      setInterim("");
      const heard = transcript.current.trim();
      transcript.current = "";
      if (heard) onFinalRef.current(heard);
    };

    try {
      instance.start();
      recognition.current = instance;
      setListening(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not start voice",
      );
    }
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  return { supported, listening, interim, error, start, stop };
}
