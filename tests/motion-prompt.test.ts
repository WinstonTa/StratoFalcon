/**
 * Steering v2: compileMotionPrompt(next, prev?) and describeMotion(state),
 * written from instructions/phases/change-steering-rework.md and the qa brief.
 *
 * Readings chosen where the spec is open:
 *  - "under about 60 words excluding the event sentence" is tested as 60 or
 *    fewer.
 *  - "no scene, place, weather or light words in the motion sentence" is
 *    tested against the preset place names and a list of weather and light
 *    words; "ground" and "horizon" are camera references and are allowed.
 *  - Sentences are split on a full stop followed by a space.
 */
import { describe, expect, it } from "vitest";

import {
  INITIAL_STATE,
  compileMotionPrompt,
  describeMotion,
} from "@/lib/sim/prompt-compiler";
import type {
  Environment,
  FlightState,
  SimEvent,
  SimState,
  TourState,
} from "@/lib/sim/types";

const BANKS: FlightState["bank"][] = ["left", "level", "right"];
const PITCHES: FlightState["pitch"][] = ["climb", "level", "descend"];
const SPEEDS: FlightState["speed"][] = ["slow", "cruise", "fast"];
const ALTITUDES: FlightState["altitude"][] = ["low", "mid", "high"];
const MOVES: TourState["move"][] = ["stand", "walk"];
const TURNS: TourState["turn"][] = ["none", "left", "right"];
const GAZES: TourState["gaze"][] = ["ahead", "up"];
const TIMES: Environment["timeOfDay"][] = ["dawn", "day", "sunset", "night"];
const WEATHERS: Environment["weather"][] = [
  "clear",
  "cloudy",
  "rain",
  "storm",
  "fog",
  "snow",
];

const NEGATION = /\b(?:no|not|never|without|none|nothing)\b|n['’]t\b/i;
const WEATHER_OR_LIGHT =
  /\b(?:weather|clear|cloud\w*|overcast|rain\w*|storm\w*|thunder\w*|lightning|fog\w*|mist\w*|snow\w*|sun\w*|dawn|dusk|midday|noon|night|daylight|light|dark|sky|skies|shadow\w*)\b/i;
const PLACE = /\b(?:paris|tokyo|los angeles|new york|manhattan|boston|venice)\b/i;

const BIRDS: SimEvent = {
  id: "birds-1",
  label: "Flock of birds",
  prompt: "A flock of white birds sweeps past ahead of the camera.",
};

function flightState(
  flight: Partial<FlightState> = {},
  environment: Partial<Environment> = {},
  event: SimEvent | null = null,
): SimState {
  return {
    mode: "flight",
    flight: { ...INITIAL_STATE.flight, ...flight },
    tour: { ...INITIAL_STATE.tour },
    environment: { ...INITIAL_STATE.environment, ...environment },
    event,
  };
}

function tourState(
  tour: Partial<TourState> = {},
  environment: Partial<Environment> = {},
  event: SimEvent | null = null,
): SimState {
  return {
    mode: "tour",
    flight: { ...INITIAL_STATE.flight },
    tour: { ...INITIAL_STATE.tour, ...tour },
    environment: { ...INITIAL_STATE.environment, ...environment },
    event,
  };
}

function allControlStates(): SimState[] {
  const states: SimState[] = [];
  for (const bank of BANKS)
    for (const pitch of PITCHES)
      for (const speed of SPEEDS)
        for (const altitude of ALTITUDES)
          states.push(flightState({ bank, pitch, speed, altitude }));
  for (const move of MOVES)
    for (const turn of TURNS)
      for (const gaze of GAZES) states.push(tourState({ move, turn, gaze }));
  return states;
}

function sentences(prompt: string): string[] {
  return prompt
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function label(state: SimState): string {
  return state.mode === "flight"
    ? `flight ${Object.values(state.flight).join("/")}`
    : `tour ${Object.values(state.tour).join("/")}`;
}

const CONTROL_STATES = allControlStates();

describe("compileMotionPrompt: the motion sentence", () => {
  it("covers 93 control combinations (81 flight, 12 tour)", () => {
    expect(CONTROL_STATES).toHaveLength(93);
  });

  it("is exactly one sentence for every combination when nothing else changed", () => {
    for (const state of CONTROL_STATES) {
      const prompt = compileMotionPrompt(state);
      expect(sentences(prompt), label(state)).toHaveLength(1);
      expect(prompt.trim().endsWith("."), label(state)).toBe(true);
      expect(wordCount(prompt), label(state)).toBeGreaterThan(5);
    }
  });

  it("is distinct for every one of the 93 combinations", () => {
    const prompts = CONTROL_STATES.map((state) => compileMotionPrompt(state));
    expect(new Set(prompts).size).toBe(93);
  });

  it("is deterministic and does not mutate its inputs", () => {
    for (const state of CONTROL_STATES) {
      const before = JSON.stringify(state);
      const first = compileMotionPrompt(state, state);
      const second = compileMotionPrompt(
        JSON.parse(before) as SimState,
        JSON.parse(before) as SimState,
      );
      expect(second, label(state)).toBe(first);
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it("has no negation, place, weather or light words", () => {
    for (const state of CONTROL_STATES) {
      const motion = compileMotionPrompt(state);
      expect(motion, label(state)).not.toMatch(NEGATION);
      expect(motion, label(state)).not.toMatch(PLACE);
      expect(motion, label(state)).not.toMatch(WEATHER_OR_LIGHT);
    }
  });

  it("carries every flight control at once", () => {
    const base = compileMotionPrompt(flightState());
    const single = {
      bank: compileMotionPrompt(flightState({ bank: "left" })),
      pitch: compileMotionPrompt(flightState({ pitch: "climb" })),
      speed: compileMotionPrompt(flightState({ speed: "fast" })),
      altitude: compileMotionPrompt(flightState({ altitude: "low" })),
    };
    for (const prompt of Object.values(single)) expect(prompt).not.toBe(base);

    // Changing any one control of a fully non-neutral state changes the prompt.
    const full: FlightState = {
      bank: "left",
      pitch: "climb",
      speed: "fast",
      altitude: "low",
    };
    const fullPrompt = compileMotionPrompt(flightState(full));
    expect(compileMotionPrompt(flightState({ ...full, bank: "right" }))).not.toBe(fullPrompt);
    expect(compileMotionPrompt(flightState({ ...full, pitch: "descend" }))).not.toBe(fullPrompt);
    expect(compileMotionPrompt(flightState({ ...full, speed: "slow" }))).not.toBe(fullPrompt);
    expect(compileMotionPrompt(flightState({ ...full, altitude: "high" }))).not.toBe(fullPrompt);
    expect(fullPrompt).toMatch(/left/);
    expect(fullPrompt).toMatch(/fast/);
    expect(fullPrompt).toMatch(/low/);
  });

  it("carries every tour control at once", () => {
    const full: TourState = { move: "walk", turn: "left", gaze: "up" };
    const fullPrompt = compileMotionPrompt(tourState(full));
    expect(compileMotionPrompt(tourState({ ...full, move: "stand" }))).not.toBe(fullPrompt);
    expect(compileMotionPrompt(tourState({ ...full, turn: "right" }))).not.toBe(fullPrompt);
    expect(compileMotionPrompt(tourState({ ...full, gaze: "ahead" }))).not.toBe(fullPrompt);
    expect(fullPrompt).toMatch(/left/);
    expect(fullPrompt).toMatch(/up/);
  });

  it("uses only the controls of next.mode", () => {
    const flight = flightState({ bank: "left" });
    const flightWithTour: SimState = {
      ...flight,
      tour: { move: "walk", turn: "right", gaze: "up" },
    };
    expect(compileMotionPrompt(flightWithTour)).toBe(compileMotionPrompt(flight));

    const tour = tourState({ move: "walk" });
    const tourWithFlight: SimState = {
      ...tour,
      flight: { bank: "right", pitch: "descend", speed: "fast", altitude: "low" },
    };
    expect(compileMotionPrompt(tourWithFlight)).toBe(compileMotionPrompt(tour));
  });

  it("does not depend on the environment when prev is omitted or equal", () => {
    for (const state of CONTROL_STATES) {
      const base = compileMotionPrompt(state);
      for (const timeOfDay of TIMES) {
        for (const weather of WEATHERS) {
          const withEnv: SimState = {
            ...state,
            environment: { timeOfDay, weather },
          };
          expect(compileMotionPrompt(withEnv), label(state)).toBe(base);
          expect(compileMotionPrompt(withEnv, withEnv), label(state)).toBe(base);
        }
      }
    }
  });
});

describe("compileMotionPrompt: environment change sentences", () => {
  it("adds 'The weather changes from … to …' only when the weather differs from prev", () => {
    for (const from of WEATHERS) {
      for (const to of WEATHERS) {
        const prev = flightState({ bank: "left" }, { weather: from });
        const next = flightState({ bank: "left" }, { weather: to });
        const parts = sentences(compileMotionPrompt(next, prev));
        expect(parts[0]).toBe(compileMotionPrompt(next));
        if (from === to) {
          expect(parts, `${from}->${to}`).toHaveLength(1);
        } else {
          expect(parts, `${from}->${to}`).toHaveLength(2);
          expect(parts[1]).toMatch(/^The weather changes from .+ to .+\.$/);
          expect(parts[1]).not.toMatch(NEGATION);
        }
      }
    }
  });

  it("adds 'The time of day changes from … to …' only when it differs from prev", () => {
    for (const from of TIMES) {
      for (const to of TIMES) {
        const prev = tourState({ move: "walk" }, { timeOfDay: from });
        const next = tourState({ move: "walk" }, { timeOfDay: to });
        const parts = sentences(compileMotionPrompt(next, prev));
        expect(parts[0]).toBe(compileMotionPrompt(next));
        if (from === to) {
          expect(parts, `${from}->${to}`).toHaveLength(1);
        } else {
          expect(parts, `${from}->${to}`).toHaveLength(2);
          expect(parts[1]).toMatch(/^The time of day changes from .+ to .+\.$/);
          expect(parts[1]).not.toMatch(NEGATION);
        }
      }
    }
  });

  it("names different targets with different sentences", () => {
    const prev = flightState();
    const weather = WEATHERS.filter((value) => value !== "clear").map((value) =>
      compileMotionPrompt(flightState({}, { weather: value }), prev),
    );
    expect(new Set(weather).size).toBe(weather.length);
    const times = TIMES.filter((value) => value !== "day").map((value) =>
      compileMotionPrompt(flightState({}, { timeOfDay: value }), prev),
    );
    expect(new Set(times).size).toBe(times.length);
  });

  it("stays at 60 words or fewer for every environment transition on the longest motion sentence", () => {
    const longestFlight = CONTROL_STATES.filter((s) => s.mode === "flight").reduce(
      (a, b) =>
        wordCount(compileMotionPrompt(b)) > wordCount(compileMotionPrompt(a)) ? b : a,
    );
    const longestTour = CONTROL_STATES.filter((s) => s.mode === "tour").reduce(
      (a, b) =>
        wordCount(compileMotionPrompt(b)) > wordCount(compileMotionPrompt(a)) ? b : a,
    );
    let longest = 0;
    for (const base of [longestFlight, longestTour]) {
      for (const fromTime of TIMES)
        for (const fromWeather of WEATHERS)
          for (const toTime of TIMES)
            for (const toWeather of WEATHERS) {
              const prev: SimState = {
                ...base,
                environment: { timeOfDay: fromTime, weather: fromWeather },
              };
              const next: SimState = {
                ...base,
                environment: { timeOfDay: toTime, weather: toWeather },
              };
              const prompt = compileMotionPrompt(next, prev);
              const changed =
                (fromTime !== toTime ? 1 : 0) + (fromWeather !== toWeather ? 1 : 0);
              expect(sentences(prompt)).toHaveLength(1 + changed);
              longest = Math.max(longest, wordCount(prompt));
            }
    }
    expect(longest).toBeLessThanOrEqual(60);
  });
});

describe("compileMotionPrompt: event sentence", () => {
  it("appends the event when prev is omitted", () => {
    const next = flightState({}, {}, { ...BIRDS });
    const parts = sentences(compileMotionPrompt(next));
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(compileMotionPrompt(flightState()));
    expect(parts[1]).toBe(BIRDS.prompt);
  });

  it("appends the event when it is new relative to prev, after any environment change", () => {
    const prev = flightState({}, { weather: "clear" });
    const next = flightState({}, { weather: "storm" }, { ...BIRDS });
    const parts = sentences(compileMotionPrompt(next, prev));
    expect(parts).toHaveLength(3);
    expect(parts[1]).toMatch(/^The weather changes from /);
    expect(parts[2]).toBe(BIRDS.prompt);
  });

  it("leaves the event out when prev already has it", () => {
    const state = flightState({ bank: "right" }, {}, { ...BIRDS });
    expect(compileMotionPrompt(state, state)).toBe(
      compileMotionPrompt(flightState({ bank: "right" })),
    );
  });

  it("appends it again for a new id with the same text", () => {
    const prev = flightState({}, {}, { ...BIRDS });
    const next = flightState({}, {}, { ...BIRDS, id: "birds-2" });
    expect(sentences(compileMotionPrompt(next, prev))).toHaveLength(2);
  });

  it("adds nothing when the event was cleared", () => {
    const prev = flightState({}, {}, { ...BIRDS });
    const next = flightState();
    expect(compileMotionPrompt(next, prev)).toBe(compileMotionPrompt(next));
  });

  it("cuts an over-long event prompt to under 40 words", () => {
    const long = `${Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ")}.`;
    const next = flightState({}, {}, { id: "long", label: "Long", prompt: long });
    const parts = sentences(compileMotionPrompt(next));
    expect(parts).toHaveLength(2);
    expect(wordCount(parts[1])).toBeLessThan(40);
  });
});

describe("describeMotion", () => {
  it("gives a distinct, non-empty label for each of the 93 combinations", () => {
    const labels = CONTROL_STATES.map((state) => describeMotion(state));
    for (const text of labels) expect(text.trim().length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(93);
  });

  it("is deterministic and ignores the environment and the other mode", () => {
    const state = flightState({ bank: "left", pitch: "climb" });
    expect(describeMotion(state)).toBe(describeMotion({ ...state }));
    expect(
      describeMotion({
        ...state,
        environment: { timeOfDay: "night", weather: "storm" },
        tour: { move: "walk", turn: "right", gaze: "up" },
      }),
    ).toBe(describeMotion(state));
  });

  it("names the turn, the climb, the speed and the height in flight", () => {
    const text = describeMotion(
      flightState({ bank: "left", pitch: "climb", speed: "fast", altitude: "low" }),
    ).toLowerCase();
    expect(text).toContain("left");
    expect(text).toContain("climb");
    expect(text).toContain("fast");
    expect(text).toContain("low");
  });

  it("names walking, the turn and the gaze on foot", () => {
    const text = describeMotion(
      tourState({ move: "walk", turn: "left", gaze: "up" }),
    ).toLowerCase();
    expect(text).toContain("walk");
    expect(text).toContain("left");
    expect(text).toContain("up");
  });
});
