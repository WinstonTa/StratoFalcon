"use client";

import { useEffect, useRef, useState } from "react";

import {
  applyFlightControl,
  applyTourControl,
  FLIGHT_KEYS,
  isControlActive,
  isTourControlActive,
  TOUR_KEYS,
} from "@/hooks/use-flight-controls";
import { describeMotion } from "@/lib/sim/prompt-compiler";
import { statesEqual, useSimStore } from "@/lib/sim/store";
import type { FlightState, TourState } from "@/lib/sim/types";

const SPEED_KNOTS: Record<FlightState["speed"], number> = {
  slow: 110,
  cruise: 240,
  fast: 420,
};

const ALTITUDE_FEET: Record<FlightState["altitude"], number> = {
  low: 400,
  mid: 1500,
  high: 9000,
};

const MIN_FEET = 250;
const MAX_FEET = 14_000;
/** Feet gained or lost per 100 ms tick while climbing or descending. */
const FEET_PER_TICK = 14;

/** Eases a displayed number toward its target so gauges roll, not jump. */
function useRollingNumber(target: number, durationMs = 1400) {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - (1 - t) ** 3;
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, target]);

  return value;
}

/**
 * The altimeter is a local instrument: it winds up while the pilot holds a
 * climb and down in a descent, and never changes the simulation state or sends
 * a prompt by itself. When the co-pilot changes the altitude band, the needle
 * eases to that band.
 */
function useAltimeter(flight: FlightState) {
  const [feet, setFeet] = useState(ALTITUDE_FEET[flight.altitude]);
  const target = useRef<number | null>(null);
  const firstBand = useRef(true);

  useEffect(() => {
    if (firstBand.current) {
      firstBand.current = false;
      return;
    }
    target.current = ALTITUDE_FEET[flight.altitude];
  }, [flight.altitude]);

  useEffect(() => {
    const timer = setInterval(() => {
      setFeet((current) => {
        if (target.current !== null) {
          const next = current + (target.current - current) * 0.12;
          if (Math.abs(target.current - next) < 15) {
            const settled = target.current;
            target.current = null;
            return settled;
          }
          return next;
        }
        if (flight.pitch === "climb") {
          return Math.min(current + FEET_PER_TICK, MAX_FEET);
        }
        if (flight.pitch === "descend") {
          return Math.max(current - FEET_PER_TICK, MIN_FEET);
        }
        return current;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [flight.pitch]);

  return feet;
}

interface Readout {
  headline: string;
  hints: string[];
}

/** What the aircraft is doing right now, and how to stop it doing that. */
export function describeFlight(flight: FlightState): Readout {
  const parts: string[] = [];
  const hints: string[] = [];

  if (flight.bank === "left") {
    parts.push("Turning left");
    hints.push("A again to straighten");
  } else if (flight.bank === "right") {
    parts.push("Turning right");
    hints.push("D again to straighten");
  }
  if (flight.pitch === "climb") {
    parts.push("Climbing");
    hints.push("W again to level");
  } else if (flight.pitch === "descend") {
    parts.push("Descending");
    hints.push("S again to level");
  }
  if (flight.speed === "fast") {
    parts.push("Fast");
    hints.push("F to slow");
  } else if (flight.speed === "slow") {
    parts.push("Slow");
    hints.push("R to speed up");
  }

  if (!parts.length) {
    return {
      headline: "Straight and level",
      hints: ["W S A D to steer", "a key stays on until you press it again"],
    };
  }
  if (flight.bank !== "level" && flight.pitch !== "level") {
    hints.push("Space levels everything");
  }
  return { headline: parts.join(" · "), hints };
}

export function describeTour(tour: TourState): Readout {
  const parts: string[] = [tour.move === "walk" ? "Walking" : "Standing"];
  const hints: string[] = [tour.move === "walk" ? "S to stop" : "W to walk"];

  if (tour.turn !== "none") {
    parts.push(`Turning ${tour.turn}`);
    hints.push(`${tour.turn === "left" ? "A" : "D"} again to face ahead`);
  }
  if (tour.gaze === "up") {
    parts.push("Looking up");
    hints.push("Q again to look ahead");
  }
  return { headline: parts.join(" · "), hints };
}

/**
 * Whether the model has been told about the current state. Prompts are paced
 * (a minimum gap apart) so each change has time to land; while one is waiting
 * its turn the countdown makes the wait read as deliberate.
 */
function SteerStatus() {
  const state = useSimStore((store) => store.state);
  const lastSentState = useSimStore((store) => store.lastSentState);
  const holdUntil = useSimStore((store) => store.steerHoldUntil);
  const inSync = statesEqual(lastSentState, state);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (holdUntil === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [holdUntil]);

  if (inSync) return <em className="hud-steer">Model in sync</em>;
  const wait = holdUntil === null ? 0 : (holdUntil - now) / 1000;
  return (
    <em className="hud-steer is-steering">
      {wait > 0.05
        ? `Steering · next update in ${wait.toFixed(1)} s`
        : "Steering · sending now"}
    </em>
  );
}

function HudReadout({ headline, hints }: Readout) {
  return (
    <div className="hud-readout">
      <strong>{headline}</strong>
      <span>{hints.join(" · ")}</span>
      <SteerStatus />
    </div>
  );
}

function HudFoot() {
  const { environment, event } = useSimStore((store) => store.state);

  return (
    <div className="hud-foot">
      <div className="hud-env">
        <span>{environment.timeOfDay}</span>
        <span>{environment.weather}</span>
        {event && <span className="hud-env-event">{event.label}</span>}
      </div>
    </div>
  );
}

function TourHud() {
  const state = useSimStore((store) => store.state);

  return (
    <div className="hud hud-tour" aria-hidden="true">
      <div className="hud-shade" />
      <HudReadout
        headline={describeMotion(state)}
        hints={describeTour(state.tour).hints}
      />
      <HudFoot />
    </div>
  );
}

function AirHud() {
  const state = useSimStore((store) => store.state);
  const { flight } = state;
  const speed = useRollingNumber(SPEED_KNOTS[flight.speed], 2200);
  const altitude = useAltimeter(flight);

  // Small, slow movements only: the HUD shows attitude without swinging.
  const bankAngle = flight.bank === "left" ? 7 : flight.bank === "right" ? -7 : 0;
  const pitchShift =
    flight.pitch === "climb" ? 6 : flight.pitch === "descend" ? -6 : 0;

  return (
    <div className="hud" aria-hidden="true">
      <div className="hud-shade" />
      <HudReadout
        headline={describeMotion(state)}
        hints={describeFlight(flight).hints}
      />

      {/* Artificial horizon: tilts gently with bank, slides with pitch. */}
      <div
        className="hud-horizon"
        style={{
          transform: `rotate(${bankAngle}deg) translateY(${pitchShift}cqh)`,
        }}
      >
        <span className="hud-rung hud-rung-up" />
        <span className="hud-horizon-line" />
        <span className="hud-rung hud-rung-down" />
      </div>
      <div className="hud-waterline">
        <span />
        <i />
        <span />
      </div>

      <div className="hud-tape hud-tape-left">
        <span className="hud-label">Speed</span>
        <span className="hud-value">{Math.round(speed)}</span>
        <span className="hud-unit">KT · {flight.speed}</span>
      </div>

      <div className="hud-tape hud-tape-right">
        <span className="hud-label">Altitude</span>
        <span className="hud-value">
          {Math.round(altitude / 10) * 10}
          <span className={`hud-trend hud-trend-${flight.pitch}`} />
        </span>
        <span className="hud-unit">
          FT ·{" "}
          {flight.pitch === "climb"
            ? "climbing"
            : flight.pitch === "descend"
              ? "descending"
              : "holding"}
        </span>
      </div>

      <HudFoot />
    </div>
  );
}

export function FlightHud() {
  const mode = useSimStore((store) => store.state.mode);
  return mode === "tour" ? <TourHud /> : <AirHud />;
}

/**
 * The key legend under the viewport, for whichever mode is active. A latched
 * key stays lit until it is pressed again. The neutral keys (Level out, Stop)
 * are never lit, so a lit key always means "this is on". The last button is
 * the transition: Land or Take off.
 */
export function FlightKeys({
  disabled,
  onLand,
  onTakeOff,
  landHint,
}: {
  disabled: boolean;
  onLand: () => void;
  onTakeOff: () => void;
  /** Set when Land is not available yet, e.g. the ground view is still being prepared. */
  landHint?: string;
}) {
  const mode = useSimStore((store) => store.state.mode);
  const flight = useSimStore((store) => store.state.flight);
  const tour = useSimStore((store) => store.state.tour);

  return (
    <div className="keys" role="group" aria-label="Controls">
      {mode === "flight"
        ? FLIGHT_KEYS.map((key) => {
            const on =
              key.control !== "level" && isControlActive(key.control, flight);
            return (
              <button
                key={key.code}
                type="button"
                className={`key${on ? " is-on" : ""}`}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => applyFlightControl(key.control, key.keycap)}
              >
                <kbd>{key.keycap}</kbd>
                <span>{key.label}</span>
              </button>
            );
          })
        : TOUR_KEYS.map((key) => {
            const on =
              key.control !== "stop" && isTourControlActive(key.control, tour);
            return (
              <button
                key={key.code}
                type="button"
                className={`key${on ? " is-on" : ""}`}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => applyTourControl(key.control, key.keycap)}
              >
                <kbd>{key.keycap}</kbd>
                <span>{key.label}</span>
              </button>
            );
          })}

      {mode === "flight" ? (
        <button
          type="button"
          className="key key-transition"
          disabled={disabled || Boolean(landHint)}
          title={landHint}
          onClick={onLand}
        >
          <kbd>L</kbd>
          <span>{landHint ?? "Land"}</span>
        </button>
      ) : (
        <button
          type="button"
          className="key key-transition"
          disabled={disabled}
          onClick={onTakeOff}
        >
          <kbd>T</kbd>
          <span>Take off</span>
        </button>
      )}
    </div>
  );
}
