"use client";

import { useEffect } from "react";

import { useSimStore } from "@/lib/sim/store";
import type { FlightState } from "@/lib/sim/types";

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

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/** Keyboard flight controls. Active only while `enabled`. */
export function useFlightControls(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target)) return;
      const key = FLIGHT_KEYS.find((entry) => entry.code === event.code);
      if (!key) return;

      // Space must not scroll the page or press whichever button has focus.
      event.preventDefault();
      if (document.activeElement instanceof HTMLButtonElement) {
        document.activeElement.blur();
      }
      applyFlightControl(key.control, key.keycap);
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
