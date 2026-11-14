"use client";

import { useEffect, useRef } from "react";

import { useSimStore } from "@/lib/sim/store";
import type { FlightState, TourState } from "@/lib/sim/types";

export type FlightControl =
  | "climb"
  | "descend"
  | "bank-left"
  | "bank-right"
  | "level"
  | "faster"
  | "slower";

export interface FlightKey {
  /** KeyboardEvent.code, so the layout does not depend on the keyboard language. */
  code: string;
  keycap: string;
  control: FlightControl;
  label: string;
}

export const FLIGHT_KEYS: FlightKey[] = [
  { code: "KeyW", keycap: "W", control: "climb", label: "Climb" },
  { code: "KeyS", keycap: "S", control: "descend", label: "Descend" },
  { code: "KeyA", keycap: "A", control: "bank-left", label: "Bank left" },
  { code: "KeyD", keycap: "D", control: "bank-right", label: "Bank right" },
  { code: "Space", keycap: "Space", control: "level", label: "Level out" },
  { code: "KeyR", keycap: "R", control: "faster", label: "Faster" },
  { code: "KeyF", keycap: "F", control: "slower", label: "Slower" },
];

const SPEEDS: FlightState["speed"][] = ["slow", "cruise", "fast"];
const ALTITUDES: FlightState["altitude"][] = ["low", "mid", "high"];

/** Whether a control is currently latched on, for lighting its keycap. */
export function isControlActive(control: FlightControl, flight: FlightState) {
  switch (control) {
    case "climb":
      return flight.pitch === "climb";
    case "descend":
      return flight.pitch === "descend";
    case "bank-left":
      return flight.bank === "left";
    case "bank-right":
      return flight.bank === "right";
    case "level":
      return flight.pitch === "level" && flight.bank === "level";
    case "faster":
      return flight.speed === "fast";
    case "slower":
      return flight.speed === "slow";
  }
}

/**
 * Latched controls: a press sets the attitude and it stays set; pressing the
 * same direction again returns that axis to neutral. Purely local — this
 * updates the store synchronously and never touches the network.
 */
export function applyFlightControl(control: FlightControl, keycap?: string) {
  const { state, applyDelta, log } = useSimStore.getState();
  if (state.mode !== "flight") return;
  const { flight } = state;
  let delta: Partial<FlightState>;

  switch (control) {
    case "climb":
      delta = { pitch: flight.pitch === "climb" ? "level" : "climb" };
      break;
    case "descend":
      delta = { pitch: flight.pitch === "descend" ? "level" : "descend" };
      break;
    case "bank-left":
      delta = { bank: flight.bank === "left" ? "level" : "left" };
      break;
    case "bank-right":
      delta = { bank: flight.bank === "right" ? "level" : "right" };
      break;
    case "level":
      delta = { bank: "level", pitch: "level" };
      break;
    case "faster":
      delta = {
        speed: SPEEDS[Math.min(SPEEDS.indexOf(flight.speed) + 1, 2)],
      };
      break;
    case "slower":
      delta = {
        speed: SPEEDS[Math.max(SPEEDS.indexOf(flight.speed) - 1, 0)],
      };
      break;
  }

  const key = FLIGHT_KEYS.find((entry) => entry.control === control);
  log("input", `${keycap ?? key?.keycap ?? "Key"} · ${key?.label ?? control}`);
  applyDelta({ flight: delta });
}

// ---------------------------------------------------------------------------
// Tour mode: W walk, S stop, A/D turn (latched), Q look up (latched).
// ---------------------------------------------------------------------------

export type TourControl =
  | "walk"
  | "stop"
  | "turn-left"
  | "turn-right"
  | "look-up";

export interface TourKey {
  code: string;
  keycap: string;
  control: TourControl;
  label: string;
}

export const TOUR_KEYS: TourKey[] = [
  { code: "KeyW", keycap: "W", control: "walk", label: "Walk" },
  { code: "KeyS", keycap: "S", control: "stop", label: "Stop" },
  { code: "KeyA", keycap: "A", control: "turn-left", label: "Turn left" },
  { code: "KeyD", keycap: "D", control: "turn-right", label: "Turn right" },
  { code: "KeyQ", keycap: "Q", control: "look-up", label: "Look up" },
];

export function isTourControlActive(control: TourControl, tour: TourState) {
  switch (control) {
    case "walk":
      return tour.move === "walk";
    case "stop":
      return tour.move === "stand";
    case "turn-left":
      return tour.turn === "left";
    case "turn-right":
      return tour.turn === "right";
    case "look-up":
      return tour.gaze === "up";
  }
}

export function applyTourControl(control: TourControl, keycap?: string) {
  const { state, applyDelta, log } = useSimStore.getState();
  if (state.mode !== "tour") return;
  const { tour } = state;
  let delta: Partial<TourState>;

  switch (control) {
    case "walk":
      delta = { move: "walk" };
      break;
    case "stop":
      delta = { move: "stand", turn: "none" };
      break;
    case "turn-left":
      delta = { turn: tour.turn === "left" ? "none" : "left" };
      break;
    case "turn-right":
      delta = { turn: tour.turn === "right" ? "none" : "right" };
      break;
    case "look-up":
      delta = { gaze: tour.gaze === "up" ? "ahead" : "up" };
      break;
  }

  const key = TOUR_KEYS.find((entry) => entry.control === control);
  log("input", `${keycap ?? key?.keycap ?? "Key"} · ${key?.label ?? control}`);
  applyDelta({ tour: delta });
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export interface TransitionKeys {
  /** L while flying. */
  onLand?: () => void;
  /** T while touring. */
  onTakeOff?: () => void;
}

/**
 * Keyboard controls for whichever mode is active. Active only while `enabled`.
 * Keys are ignored while focus is in a text field.
 */
export function useFlightControls(enabled: boolean, transitions?: TransitionKeys) {
  const transitionsRef = useRef(transitions);
  transitionsRef.current = transitions;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target)) return;
      const mode = useSimStore.getState().state.mode;
      const flightKey =
        mode === "flight"
          ? FLIGHT_KEYS.find((entry) => entry.code === event.code)
          : undefined;
      const tourKey =
        mode === "tour"
          ? TOUR_KEYS.find((entry) => entry.code === event.code)
          : undefined;
      const transition =
        mode === "flight" && event.code === "KeyL"
          ? transitionsRef.current?.onLand
          : mode === "tour" && event.code === "KeyT"
            ? transitionsRef.current?.onTakeOff
            : undefined;
      if (!flightKey && !tourKey && !transition) return;

      // Space must not scroll the page or press whichever button has focus.
      event.preventDefault();
      if (document.activeElement instanceof HTMLButtonElement) {
        document.activeElement.blur();
      }
      if (flightKey) applyFlightControl(flightKey.control, flightKey.keycap);
      else if (tourKey) applyTourControl(tourKey.control, tourKey.keycap);
      else transition?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}

const BAND_SECONDS = 7;
const LIMIT_SECONDS = 1.5;

/**
 * A held climb or descent moves the aircraft one altitude band after a few
 * seconds, and levels off by itself at the top or bottom band. This keeps the
 * altitude gauge honest and stops the model being asked to climb forever.
 */
export function useAltitudeBands(enabled: boolean) {
  const pitch = useSimStore((store) => store.state.flight.pitch);
  const altitude = useSimStore((store) => store.state.flight.altitude);

  useEffect(() => {
    if (!enabled || pitch === "level") return;
    const target = ALTITUDES.indexOf(altitude) + (pitch === "climb" ? 1 : -1);
    const atLimit = target < 0 || target >= ALTITUDES.length;

    const timer = setTimeout(
      () => {
        const { applyDelta, log } = useSimStore.getState();
        if (atLimit) {
          log(
            "system",
            pitch === "climb"
              ? "Ceiling reached. Levelling off"
              : "Minimum altitude. Levelling off",
          );
          applyDelta({ flight: { pitch: "level" } });
        } else {
          log("system", `Passing into the ${ALTITUDES[target]} altitude band`);
          applyDelta({ flight: { altitude: ALTITUDES[target] } });
        }
      },
      (atLimit ? LIMIT_SECONDS : BAND_SECONDS) * 1000,
    );
    return () => clearTimeout(timer);
  }, [altitude, enabled, pitch]);
}
