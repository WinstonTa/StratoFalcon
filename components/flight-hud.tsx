"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import {
  applyFlightControl,
  applyTourControl,
  FLIGHT_KEYS,
  isControlActive,
  isTourControlActive,
  TOUR_KEYS,
} from "@/hooks/use-flight-controls";
import { compileSteerQueue } from "@/lib/sim/prompt-compiler";
import { useSimStore } from "@/lib/sim/store";
import type { FlightState } from "@/lib/sim/types";

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
 * How far to nudge the video itself. The nudge is strongest for the first few
 * seconds after an input, covering the model's 2–4 s latency, then relaxes to a
 * small residual so it does not stack on top of the model's own motion.
 */
export function useVideoFeedbackStyle(): CSSProperties {
  const mode = useSimStore((store) => store.state.mode);
  const flight = useSimStore((store) => store.state.flight);
  const tour = useSimStore((store) => store.state.tour);
  const signature = `${mode}|${flight.bank}|${flight.pitch}|${flight.speed}|${tour.move}|${tour.turn}|${tour.gaze}`;
  const [boost, setBoost] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setBoost(true);
    const timer = setTimeout(() => setBoost(false), 4500);
    return () => clearTimeout(timer);
  }, [signature]);

  let roll = 0;
  let shiftX = 0;
  let shiftY = 0;
  let push = 0;

  if (mode === "flight") {
    // Left bank drops the left wing, so the world appears to turn clockwise.
    roll =
      (flight.bank === "left" ? 1 : flight.bank === "right" ? -1 : 0) *
      (boost ? 3 : 1.2);
    shiftY =
      (flight.pitch === "climb" ? 1 : flight.pitch === "descend" ? -1 : 0) *
      (boost ? 2 : 0.8);
    push = flight.speed === "fast" ? (boost ? 0.06 : 0.025) : 0;
  } else {
    // Turning left slides the scene to the right; looking up slides it down.
    shiftX =
      (tour.turn === "left" ? 1 : tour.turn === "right" ? -1 : 0) *
      (boost ? 2.5 : 0.8);
    shiftY = tour.gaze === "up" ? (boost ? 2.5 : 1) : 0;
    push = tour.move === "walk" ? (boost ? 0.04 : 0.015) : 0;
  }

  // Scale up just enough that rotation and shift never expose an edge.
  const radians = (Math.abs(roll) * Math.PI) / 180;
  const cover =
    (Math.cos(radians) + (16 / 9) * Math.sin(radians)) *
    (1 + (2 * Math.max(Math.abs(shiftX), Math.abs(shiftY))) / 100);
  const zoom = Math.max(cover, 1) * (1 + push);

  return {
    transform: `translate(${shiftX}%, ${shiftY}%) rotate(${roll}deg) scale(${zoom.toFixed(4)})`,
    transitionDuration: boost ? "700ms" : "2600ms",
  };
}

function HudFoot({ lines }: { lines: string[] }) {
  const state = useSimStore((store) => store.state);
  const lastSentState = useSimStore((store) => store.lastSentState);
  const queued = compileSteerQueue(lastSentState, state).length;
  const { environment, event } = state;

  return (
    <div className="hud-foot">
      <div className="hud-attitude">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
      <div className="hud-env">
        <span>{environment.timeOfDay}</span>
        <span>{environment.weather}</span>
        {event && <span className="hud-env-event">{event.label}</span>}
      </div>
      <div className={`hud-sync${queued ? " is-steering" : ""}`}>
        {queued ? `Steering model · ${queued} queued` : "Model in sync"}
      </div>
    </div>
  );
}

function TourHud() {
  const tour = useSimStore((store) => store.state.tour);
  const lines = [
    tour.move === "walk" ? "Walking" : "Standing",
    tour.turn === "none" ? "Facing ahead" : `Turning ${tour.turn}`,
    ...(tour.gaze === "up" ? ["Looking up"] : []),
  ];

  return (
    <div className="hud hud-tour" aria-hidden="true">
      <div className="hud-shade" />
      <div className="hud-tag">On foot · street level</div>
      <HudFoot lines={lines} />
    </div>
  );
}

function AirHud() {
  const flight = useSimStore((store) => store.state.flight);
  const speed = useRollingNumber(SPEED_KNOTS[flight.speed]);
  const altitude = useRollingNumber(ALTITUDE_FEET[flight.altitude], 5000);

  const bankAngle =
    flight.bank === "left" ? 14 : flight.bank === "right" ? -14 : 0;
  const pitchShift =
    flight.pitch === "climb" ? 20 : flight.pitch === "descend" ? -20 : 0;

  const lines = [
    flight.bank === "level" ? "Wings level" : `Bank ${flight.bank}`,
    flight.pitch === "level"
      ? "Level flight"
      : flight.pitch === "climb"
        ? "Climbing"
        : "Descending",
  ];

  return (
    <div className="hud" aria-hidden="true">
      <div className="hud-shade" />

      {/* Horizon line and pitch ladder: tilts with bank, slides with pitch. */}
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
        <span className="hud-unit">FT · {flight.altitude}</span>
      </div>

      <HudFoot lines={lines} />
    </div>
  );
}

export function FlightHud() {
  const mode = useSimStore((store) => store.state.mode);
  return mode === "tour" ? <TourHud /> : <AirHud />;
}

/**
 * The key legend under the viewport, for whichever mode is active. Keycaps
 * light while latched. The last button is the transition: Land or Take off.
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
        ? FLIGHT_KEYS.map((key) => (
            <button
              key={key.code}
              type="button"
              className={`key${isControlActive(key.control, flight) ? " is-on" : ""}`}
              disabled={disabled}
              onClick={(event) => {
                event.currentTarget.blur();
                applyFlightControl(key.control, key.keycap);
              }}
            >
              <kbd>{key.keycap}</kbd>
              <span>{key.label}</span>
            </button>
          ))
        : TOUR_KEYS.map((key) => (
            <button
              key={key.code}
              type="button"
              className={`key${isTourControlActive(key.control, tour) ? " is-on" : ""}`}
              disabled={disabled}
              onClick={(event) => {
                event.currentTarget.blur();
                applyTourControl(key.control, key.keycap);
              }}
            >
              <kbd>{key.keycap}</kbd>
              <span>{key.label}</span>
            </button>
          ))}

      {mode === "flight" ? (
        <button
          type="button"
          className="key key-transition"
          disabled={disabled || Boolean(landHint)}
          title={landHint}
          onClick={(event) => {
            event.currentTarget.blur();
            onLand();
          }}
        >
          <kbd>L</kbd>
          <span>{landHint ?? "Land"}</span>
        </button>
      ) : (
        <button
          type="button"
          className="key key-transition"
          disabled={disabled}
          onClick={(event) => {
            event.currentTarget.blur();
            onTakeOff();
          }}
        >
          <kbd>T</kbd>
          <span>Take off</span>
        </button>
      )}
    </div>
  );
}
