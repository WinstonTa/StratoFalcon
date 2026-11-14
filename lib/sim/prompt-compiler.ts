/**
 * StratoFalcon prompt compiler.
 *
 * Pure, synchronous and browser-safe: no Node APIs, no network, no state.
 * Turns structured SimState into Orbis prompts ("state over strings").
 *
 * Orbis prompt rules this file follows (master doc, section 2):
 *  - the kickoff is WHO + WHAT + WHERE + camera, sent once;
 *  - every steer is ONE action in physical language, under 40 words;
 *  - steers carry no negation words and never restate the place name.
 */

import type {
  Environment,
  FlightState,
  SimEvent,
  SimMode,
  SimState,
  SimStateDelta,
  TourState,
} from "./types";

// ---------------------------------------------------------------------------
// Contract enums as runtime values (the contract file is types only).
// ---------------------------------------------------------------------------

type AllowedValues<T> = { readonly [K in keyof T]: readonly T[K][] };

export const FLIGHT_VALUES: AllowedValues<FlightState> = {
  bank: ["left", "level", "right"],
  pitch: ["climb", "level", "descend"],
  speed: ["slow", "cruise", "fast"],
  altitude: ["low", "mid", "high"],
};

export const TOUR_VALUES: AllowedValues<TourState> = {
  move: ["stand", "walk"],
  turn: ["none", "left", "right"],
  gaze: ["ahead", "up"],
};

export const ENVIRONMENT_VALUES: AllowedValues<Environment> = {
  timeOfDay: ["dawn", "day", "sunset", "night"],
  weather: ["clear", "cloudy", "rain", "storm", "fog", "snow"],
};

export const INITIAL_STATE: SimState = {
  mode: "flight",
  flight: { bank: "level", pitch: "level", speed: "cruise", altitude: "mid" },
  tour: { move: "stand", turn: "none", gaze: "ahead" },
  environment: { timeOfDay: "day", weather: "clear" },
  event: null,
};

/**
 * Most words a single steer sentence may have. The rule is "under 40 words",
 * so the ceiling is 39.
 */
export const MAX_STEER_WORDS = 39;

// ---------------------------------------------------------------------------
// Delta sanitizing and application
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function limitWords(text: string, maxWords: number): string {
  const words = collapse(text).split(" ");
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ").replace(/[,;:.!?]+$/, "")}.`;
}

function pickGroup<T>(
  raw: unknown,
  allowed: AllowedValues<T>,
): Partial<T> | undefined {
  if (!isRecord(raw)) return undefined;
  const picked: Partial<T> = {};
  let found = false;
  for (const key of Object.keys(allowed) as (keyof T & string)[]) {
    const value = raw[key];
    if ((allowed[key] as readonly unknown[]).includes(value)) {
      picked[key] = value as T[typeof key];
      found = true;
    }
  }
  return found ? picked : undefined;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "event"
  );
}

/**
 * Returns a clean event, `null` for an explicit clear, or `undefined` when the
 * input is not a usable event (the caller should then leave the event alone).
 */
function sanitizeEvent(raw: unknown): SimEvent | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;
  if (typeof raw.prompt !== "string") return undefined;
  const prompt = limitWords(raw.prompt, MAX_STEER_WORDS);
  if (!prompt) return undefined;
  const label =
    typeof raw.label === "string" && collapse(raw.label)
      ? collapse(raw.label).slice(0, 40)
      : "Event";
  const id =
    typeof raw.id === "string" && collapse(raw.id)
      ? collapse(raw.id).slice(0, 60)
      : slug(label);
  return { id, label, prompt };
}

/**
 * Reduces any value to a SimStateDelta that only contains contract keys and
 * valid enum values. Unknown keys and invalid values are dropped. Safe to run
 * on untrusted input such as model output.
 */
export function sanitizeDelta(raw: unknown): SimStateDelta {
  const delta: SimStateDelta = {};
  if (!isRecord(raw)) return delta;

  const flight = pickGroup<FlightState>(raw.flight, FLIGHT_VALUES);
  if (flight) delta.flight = flight;

  const tour = pickGroup<TourState>(raw.tour, TOUR_VALUES);
  if (tour) delta.tour = tour;

  const environment = pickGroup<Environment>(
    raw.environment,
    ENVIRONMENT_VALUES,
  );
  if (environment) delta.environment = environment;

  if ("event" in raw) {
    const event = sanitizeEvent(raw.event);
    if (event !== undefined) delta.event = event;
  }
  return delta;
}

/**
 * Immutable merge. Returns a new state; the input is never mutated. Unknown
 * keys and invalid enum values in the delta are ignored. `mode` is not part of
 * a delta and is carried over unchanged.
 */
export function applyDelta(state: SimState, delta: SimStateDelta): SimState {
  const clean = sanitizeDelta(delta);
  return {
    mode: state.mode,
    flight: { ...state.flight, ...clean.flight },
    tour: { ...state.tour, ...clean.tour },
    environment: { ...state.environment, ...clean.environment },
    event:
      "event" in clean
        ? (clean.event ?? null)
        : state.event
          ? { ...state.event }
          : null,
  };
}

// ---------------------------------------------------------------------------
// Steer sentences. One action each, physical nouns and verbs, no negation
// words, no place names, all well under 40 words.
// ---------------------------------------------------------------------------

const BANK_STEER: Record<FlightState["bank"], string> = {
  left: "The aircraft banks left, the horizon tilts and the view sweeps left across the landscape below.",
  right:
    "The aircraft banks right, the horizon tilts and the view sweeps right across the landscape below.",
  level:
    "The aircraft rolls back to wings level, the horizon settles flat and the view flies straight ahead.",
};

const PITCH_STEER: Record<FlightState["pitch"], string> = {
  climb:
    "The aircraft pitches up and climbs, the ground falls away below and more sky fills the view.",
  descend:
    "The aircraft pitches down and descends, the ground rises closer and details below grow larger.",
  level:
    "The aircraft eases back to level flight, the horizon rests across the middle of the view and the flight continues straight ahead.",
};

const ALTITUDE_STEER: Record<FlightState["altitude"], string> = {
  low: "The aircraft settles to a low altitude, skimming just above the rooftops with details rushing past close below.",
  mid: "The aircraft settles at a medium altitude, a few hundred meters up, with streets and buildings spread out below.",
  high: "The aircraft rises to a high altitude, the landscape spreads wide far below and thin haze softens the distant horizon.",
};

const SPEED_STEER: Record<FlightState["speed"], string> = {
  slow: "The aircraft slows to a gentle glide and the landscape drifts past slowly below.",
  cruise:
    "The aircraft settles to a steady cruising speed and the landscape flows past smoothly below.",
  fast: "The aircraft accelerates and the landscape streaks past quickly below with a strong rush of forward motion.",
};

const MOVE_STEER: Record<TourState["move"], string> = {
  walk: "The viewer walks forward at a relaxed pace, the surroundings gliding past on both sides.",
  stand:
    "The viewer comes to a standstill and stands in place, the view resting on the scene ahead as life moves around.",
};

const TURN_STEER: Record<TourState["turn"], string> = {
  left: "The viewer turns to the left and the view pans left, revealing the scene in that direction.",
  right:
    "The viewer turns to the right and the view pans right, revealing the scene in that direction.",
  none: "The viewer faces straight ahead again and the view settles forward along the way ahead.",
};

const GAZE_STEER: Record<TourState["gaze"], string> = {
  up: "The viewer tilts their head up and the view rises to the tops of the buildings and the open sky above.",
  ahead:
    "The viewer lowers their gaze back to eye level, looking straight ahead at the scene.",
};

const WEATHER_STEER: Record<Environment["weather"], string> = {
  clear:
    "The clouds part and the sky clears, with crisp visibility all the way to the horizon.",
  cloudy:
    "Gray clouds gather and spread across the sky, casting soft, even light over the scene.",
  rain: "Steady rain begins to fall, streaking through the air and leaving surfaces wet and reflective.",
  storm:
    "A thunderstorm rolls in with dark towering clouds, heavy rain and flashes of lightning across the sky.",
  fog: "Thick fog drifts in, softening the scene and fading distant shapes into pale gray.",
  snow: "Snow begins to fall, with white flakes drifting through the air and settling on surfaces.",
};

function timeOfDaySteer(
  timeOfDay: Environment["timeOfDay"],
  mode: SimMode,
): string {
  switch (timeOfDay) {
    case "dawn":
      return "The light shifts to dawn, a pale pink and gold glow rising on the horizon under a soft blue sky.";
    case "day":
      return "The light shifts to bright midday, with the sun high and clear daylight across the scene.";
    case "sunset":
      return "The light shifts to sunset, the low sun casting warm orange light and long shadows under a glowing sky.";
    case "night":
      return mode === "flight"
        ? "Night falls, the sky turns deep dark blue and thousands of lights glow across the landscape below."
        : "Night falls, the sky turns deep dark blue and street lamps and windows glow warmly all around.";
  }
}

// ---------------------------------------------------------------------------
// Steer queue
// ---------------------------------------------------------------------------

/** One pending change: the sentence to send and the state change it covers. */
export interface SteerStep {
  /** The exact text for `set_prompt`. */
  prompt: string;
  /** Apply to the last-sent state with applyDelta once this prompt is sent. */
  delta: SimStateDelta;
}

function sameEvent(a: SimEvent | null, b: SimEvent | null): boolean {
  if (a === null || b === null) return a === b;
  return a.id === b.id && a.prompt === b.prompt;
}

/**
 * Ordered list of pending changes between two states, each paired with the
 * single-field delta it represents. Priority: event, then the controls for
 * `next.mode`, then environment. Controls of the other mode are ignored.
 *
 * Scheduler use: send `steps[0].prompt`, then set
 * `lastSent = applyDelta(lastSent, steps[0].delta)`.
 */
export function compileSteerSteps(prev: SimState, next: SimState): SteerStep[] {
  const steps: SteerStep[] = [];

  if (next.event && !sameEvent(prev.event, next.event)) {
    const prompt = limitWords(next.event.prompt, MAX_STEER_WORDS);
    if (prompt) steps.push({ prompt, delta: { event: next.event } });
  }

  if (next.mode === "flight") {
    const a = prev.flight;
    const b = next.flight;
    if (a.bank !== b.bank) {
      steps.push({
        prompt: BANK_STEER[b.bank],
        delta: { flight: { bank: b.bank } },
      });
    }
    if (a.pitch !== b.pitch) {
      steps.push({
        prompt: PITCH_STEER[b.pitch],
        delta: { flight: { pitch: b.pitch } },
      });
    }
    if (a.altitude !== b.altitude) {
      steps.push({
        prompt: ALTITUDE_STEER[b.altitude],
        delta: { flight: { altitude: b.altitude } },
      });
    }
    if (a.speed !== b.speed) {
      steps.push({
        prompt: SPEED_STEER[b.speed],
        delta: { flight: { speed: b.speed } },
      });
    }
  } else {
    const a = prev.tour;
    const b = next.tour;
    if (a.move !== b.move) {
      steps.push({
        prompt: MOVE_STEER[b.move],
        delta: { tour: { move: b.move } },
      });
    }
    if (a.turn !== b.turn) {
      steps.push({
        prompt: TURN_STEER[b.turn],
        delta: { tour: { turn: b.turn } },
      });
    }
    if (a.gaze !== b.gaze) {
      steps.push({
        prompt: GAZE_STEER[b.gaze],
        delta: { tour: { gaze: b.gaze } },
      });
    }
  }

  if (prev.environment.weather !== next.environment.weather) {
    steps.push({
      prompt: WEATHER_STEER[next.environment.weather],
      delta: { environment: { weather: next.environment.weather } },
    });
  }
  if (prev.environment.timeOfDay !== next.environment.timeOfDay) {
    steps.push({
      prompt: timeOfDaySteer(next.environment.timeOfDay, next.mode),
      delta: { environment: { timeOfDay: next.environment.timeOfDay } },
    });
  }

  return steps;
}

/**
 * Ordered list of all pending changes, one sentence each. Priority: event,
 * then controls, then environment. Empty when nothing relevant changed.
 */
export function compileSteerQueue(prev: SimState, next: SimState): string[] {
  return compileSteerSteps(prev, next).map((step) => step.prompt);
}

/**
 * The single most important change between two states as one action
 * sentence, or null when nothing relevant to `next.mode` changed.
 */
export function compileSteer(prev: SimState, next: SimState): string | null {
  return compileSteerSteps(prev, next)[0]?.prompt ?? null;
}

// ---------------------------------------------------------------------------
// Kickoff
// ---------------------------------------------------------------------------

const TIME_KICKOFF: Record<Environment["timeOfDay"], string> = {
  dawn: "at dawn with pale pink and gold light on the horizon",
  day: "in bright midday daylight",
  sunset: "at sunset with warm orange light and long shadows",
  night: "at night with lights glowing across the scene",
};

const WEATHER_KICKOFF: Record<Environment["weather"], string> = {
  clear: "under a clear sky",
  cloudy: "under gray overcast clouds",
  rain: "in steady rain with wet, reflective surfaces",
  storm: "under a dark thunderstorm with heavy rain and flashes of lightning",
  fog: "in thick drifting fog",
  snow: "in gently falling snow",
};

const ALTITUDE_KICKOFF: Record<FlightState["altitude"], string> = {
  low: "low, just above the rooftops",
  mid: "at a medium altitude a few hundred meters up",
  high: "at a high altitude with the landscape spread wide below",
};

const SPEED_KICKOFF: Record<FlightState["speed"], string> = {
  slow: "at a slow, gentle glide",
  cruise: "at a steady cruising speed",
  fast: "at high speed",
};

const BANK_KICKOFF: Record<FlightState["bank"], string> = {
  left: ", banking left with the horizon tilted",
  right: ", banking right with the horizon tilted",
  level: "",
};

const PITCH_KICKOFF: Record<FlightState["pitch"], string> = {
  climb: ", climbing as the ground falls away",
  descend: ", descending as the ground rises closer",
  level: "",
};

const GAZE_KICKOFF: Record<TourState["gaze"], string> = {
  ahead: "looking straight ahead",
  up: "looking up toward the tops of the buildings and the sky",
};

const TURN_KICKOFF: Record<TourState["turn"], string> = {
  none: "",
  left: " while turning to the left",
  right: " while turning to the right",
};

function cleanPlaceName(placeName: string): string {
  const name = collapse(typeof placeName === "string" ? placeName : "")
    .replace(/[.!?]+$/, "")
    .slice(0, 80);
  return name || "a scenic landscape";
}

/**
 * Full WHO + WHAT + WHERE + camera prompt for the first frame. Used for
 * uploaded photos; presets ship their own hand-written kickoff.
 */
export function compileKickoff(placeName: string, state: SimState): string {
  const place = cleanPlaceName(placeName);
  const { environment, flight, tour } = state;
  const light = `${TIME_KICKOFF[environment.timeOfDay]}, ${WEATHER_KICKOFF[environment.weather]}`;

  if (state.mode === "flight") {
    return [
      `A first-person aerial view from an aircraft flying forward over ${place}, ${light}.`,
      `The camera glides forward ${ALTITUDE_KICKOFF[flight.altitude]} ${SPEED_KICKOFF[flight.speed]}${BANK_KICKOFF[flight.bank]}${PITCH_KICKOFF[flight.pitch]}, the landscape flowing toward and beneath the viewer.`,
      "Photorealistic, one continuous shot with smooth forward motion.",
    ].join(" ");
  }

  const movement =
    tour.move === "walk"
      ? "walks forward at a relaxed pace"
      : "stands at eye level";
  return [
    `A first-person walking view at street level in ${place}, ${light}.`,
    `The viewer ${movement}, ${GAZE_KICKOFF[tour.gaze]}${TURN_KICKOFF[tour.turn]}, as people and everyday life move naturally through the scene.`,
    "Photorealistic, one continuous shot at eye level.",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Whole-motion prompt (steering v2)
//
// Orbis facts this follows (Dynamic prompt guide): every set_prompt REPLACES
// the active prompt; the model preserves whatever a prompt does not change;
// restating the world can read as a scene rebuild; a change must be stated
// explicitly ("The weather changes from sunny to rainy."); an ongoing action
// is restated with "continues".
//
// So each prompt is ONE camera-motion sentence covering every control of the
// current mode at once (a later key press no longer drops the earlier one),
// plus explicit change sentences only for what just changed. Camera words
// come from the documented vocabulary: POV, aerial, eye-level, push, pan,
// tilt. No scene or place words, no weather in the motion sentence, no
// adjectives of intent, no negation.
//
// The phrase tables below are the only place the wording lives.
// ---------------------------------------------------------------------------

const MOTION_FLIGHT_CAMERA = "The aerial POV camera continues its";

/** Pace of the forward push. */
const MOTION_SPEED: Record<FlightState["speed"], string> = {
  slow: "slow push forward",
  cruise: "steady push forward",
  fast: "fast push forward",
};

/** Height, only where it reads as part of the camera move. `mid` adds nothing. */
const MOTION_ALTITUDE: Record<FlightState["altitude"], string> = {
  low: "low over the ground",
  mid: "",
  high: "high above the ground",
};

/** A turn is a slow pan with a level horizon. `level` is handled with pitch below. */
const MOTION_BANK: Record<FlightState["bank"], string> = {
  level: "heading straight",
  left: "panning slowly left with the horizon level",
  right: "panning slowly right with the horizon level",
};

/** `level` adds nothing on its own. */
const MOTION_PITCH: Record<FlightState["pitch"], string> = {
  level: "",
  climb: "rising steadily as the ground drops away below",
  descend: "descending steadily as the ground comes closer",
};

/** Used when both bank and pitch are neutral. */
const MOTION_FLIGHT_NEUTRAL = "level and straight";

const MOTION_MOVE: Record<TourState["move"], string> = {
  walk: "The eye-level POV camera walks steadily forward",
  stand: "The eye-level POV camera stands still",
};

/** `none` adds nothing on its own. */
const MOTION_TURN: Record<TourState["turn"], string> = {
  none: "",
  left: "panning slowly left",
  right: "panning slowly right",
};

/** `ahead` adds nothing on its own. */
const MOTION_GAZE: Record<TourState["gaze"], string> = {
  ahead: "",
  up: "tilting slowly upward",
};

/** Used when both turn and gaze are neutral. */
const MOTION_TOUR_NEUTRAL = "level and facing straight ahead";

/** "The weather changes from <FROM> to <TO>." */
const WEATHER_FROM: Record<Environment["weather"], string> = {
  clear: "clear skies",
  cloudy: "overcast",
  rain: "rain",
  storm: "a thunderstorm",
  fog: "fog",
  snow: "snowfall",
};

const WEATHER_TO: Record<Environment["weather"], string> = {
  clear: "clear open skies",
  cloudy: "a gray overcast sky",
  rain: "steady rain with wet, shining surfaces",
  storm: "a heavy thunderstorm with rain and lightning",
  fog: "thick fog that fades the distance",
  snow: "steady snowfall settling white on surfaces",
};

/** "The time of day changes from <FROM> to <TO>." */
const TIME_FROM: Record<Environment["timeOfDay"], string> = {
  dawn: "dawn",
  day: "midday",
  sunset: "sunset",
  night: "night",
};

const TIME_TO: Record<Environment["timeOfDay"], string> = {
  dawn: "dawn, with pale pink light low on the horizon",
  day: "bright midday, with the sun high",
  sunset: "sunset, with low golden light",
  night: "night, with a dark sky and glowing lights",
};

function motionSentence(state: SimState): string {
  if (state.mode === "flight") {
    const { altitude, speed, bank, pitch } = state.flight;
    const push = [MOTION_FLIGHT_CAMERA, MOTION_SPEED[speed], MOTION_ALTITUDE[altitude]]
      .filter(Boolean)
      .join(" ");
    const attitude =
      bank === "level" && pitch === "level"
        ? [MOTION_FLIGHT_NEUTRAL]
        : [MOTION_BANK[bank], MOTION_PITCH[pitch]].filter(Boolean);
    return `${[push, ...attitude].join(", ")}.`;
  }
  const { move, turn, gaze } = state.tour;
  const attitude =
    turn === "none" && gaze === "ahead"
      ? [MOTION_TOUR_NEUTRAL]
      : [MOTION_TURN[turn], MOTION_GAZE[gaze]].filter(Boolean);
  return `${[MOTION_MOVE[move], ...attitude].join(", ")}.`;
}

/**
 * ONE prompt for the whole current motion, meant to be sent last-write-wins
 * whenever state changes.
 *
 *  1. Always: one camera-motion sentence for `next.mode` that carries every
 *     control at once (neutral included).
 *  2. Only when `prev` is given: one explicit change sentence for each of
 *     weather and time of day that differs between `prev` and `next`.
 *     Unchanged weather and light are never restated.
 *  3. The event sentence, only when `next.event` is non-null and differs
 *     from `prev.event` (or `prev` is omitted).
 *
 * Deterministic: the same (next, prev) always gives the identical string.
 */
export function compileMotionPrompt(next: SimState, prev?: SimState): string {
  const parts = [motionSentence(next)];

  if (prev) {
    if (prev.environment.weather !== next.environment.weather) {
      parts.push(
        `The weather changes from ${WEATHER_FROM[prev.environment.weather]} to ${WEATHER_TO[next.environment.weather]}.`,
      );
    }
    if (prev.environment.timeOfDay !== next.environment.timeOfDay) {
      parts.push(
        `The time of day changes from ${TIME_FROM[prev.environment.timeOfDay]} to ${TIME_TO[next.environment.timeOfDay]}.`,
      );
    }
  }

  if (next.event && !(prev && sameEvent(prev.event, next.event))) {
    const eventPrompt = limitWords(next.event.prompt, MAX_STEER_WORDS);
    if (eventPrompt) {
      parts.push(/[.!?]$/.test(eventPrompt) ? eventPrompt : `${eventPrompt}.`);
    }
  }

  return parts.join(" ");
}

const LABEL_BANK: Record<FlightState["bank"], string> = {
  level: "Straight",
  left: "Turning left",
  right: "Turning right",
};

const LABEL_PITCH: Record<FlightState["pitch"], string> = {
  level: "level",
  climb: "climbing",
  descend: "descending",
};

/** Short HUD label for the current motion, e.g. "Turning left · climbing · fast · low". */
export function describeMotion(state: SimState): string {
  if (state.mode === "flight") {
    const { bank, pitch, speed, altitude } = state.flight;
    return [LABEL_BANK[bank], LABEL_PITCH[pitch], speed, altitude].join(" · ");
  }
  const { move, turn, gaze } = state.tour;
  return [
    move === "walk" ? "Walking" : "Standing",
    turn === "none" ? "" : `turning ${turn}`,
    gaze === "up" ? "looking up" : "looking ahead",
  ]
    .filter(Boolean)
    .join(" · ");
}
