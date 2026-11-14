"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useCopilot, useVoiceCommand } from "@/hooks/use-copilot";
import { setGuideMicOpen } from "@/hooks/use-guide";

/**
 * The co-pilot: a text box and a push-to-talk microphone. Both go through
 * /api/sim/command. Flight keys are ignored while the box has focus (the key
 * handler skips typing targets); Enter sends and Escape hands the keys back.
 */
export function CommandBar({ disabled }: { disabled: boolean }) {
  const { send, pending } = useCopilot();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const sendVoice = useCallback(
    (heard: string) => void send(heard, "voice"),
    [send],
  );
  const voice = useVoiceCommand(sendVoice);
  const { start: startVoice, stop: stopVoice } = voice;

  // The guide stops talking the moment the microphone opens.
  useEffect(() => {
    setGuideMicOpen(voice.listening);
    return () => setGuideMicOpen(false);
  }, [voice.listening]);

  // Hold V to talk, as an alternative to holding the mic button.
  useEffect(() => {
    if (disabled || !voice.supported) return;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement;
    const down = (event: KeyboardEvent) => {
      if (event.code !== "KeyV" || event.repeat || typing(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      startVoice();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "KeyV") stopVoice();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [disabled, startVoice, stopVoice, voice.supported]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    void send(text, "typed");
    setText("");
    // Hand the keyboard back to the flight controls.
    input.current?.blur();
  };

  const status = voice.listening
    ? "Listening… release to send"
    : pending
      ? `Co-pilot thinking${pending > 1 ? ` (${pending})` : ""}…`
      : voice.error;

  return (
    <form className="command" onSubmit={submit}>
      <button
        type="button"
        className={`mic${voice.listening ? " is-listening" : ""}`}
        disabled={disabled || voice.supported !== true}
        title={
          voice.supported === false
            ? "Voice needs Chrome"
            : "Hold to talk (or hold V)"
        }
        onPointerDown={(event) => {
          event.preventDefault();
          startVoice();
        }}
        onPointerUp={stopVoice}
        onPointerLeave={stopVoice}
        onPointerCancel={stopVoice}
      >
        <span className="mic-dot" aria-hidden="true" />
        {voice.supported === false
          ? "Voice needs Chrome"
          : voice.listening
            ? "Listening"
            : "Hold to talk"}
      </button>

      <input
        ref={input}
        type="text"
        className="command-input"
        aria-label="Command for the co-pilot"
        placeholder="Tell the co-pilot: make it sunset, take us lower over the water…"
        maxLength={500}
        disabled={disabled}
        readOnly={voice.listening}
        value={voice.listening ? voice.interim : text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
      />

      <button
        type="submit"
        className="btn btn-small"
        disabled={disabled || !text.trim()}
      >
        Send
      </button>

      <span
        className={`command-status${pending || voice.listening ? " is-busy" : ""}`}
        role="status"
      >
        {status}
      </span>
    </form>
  );
}
