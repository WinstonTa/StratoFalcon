/**
 * Prompt-compiler tests, written from the spec (master doc section 3.2 and the
 * qa brief), not from the implementation.
 *
 * Readings chosen where the spec is open:
 *  - "under 40 words" is tested as strictly fewer than 40 words.
 *  - compileSteer(prev, next) is tested as equal to compileSteerQueue(prev, next)[0].
 *  - "does not contain the place name" is tested against the six preset names,
 *    because compileSteer does not receive a place name.
 *  - `mode` is not part of SimStateDelta, so applyDelta must ignore it.
 *  - A queue entry for one changed field is expected to be the same sentence
 *    that the field produces when it is the only change.
 */
import { describe, expect, it } from "vitest";

import {
  INITIAL_STATE,
  applyDelta,
  compileKickoff,
  compileSteer,
  compileSteerQueue,
} from "@/lib/sim/prompt-compiler";
import type {
  SimEvent,
  SimMode,
  SimState,
  SimStateDelta,
} from "@/lib/sim/types";

// Enum values copied from the contract (lib/sim/types.ts). The first value in
// each list is not special; neutral values are named in NEUTRAL below.
const FLIGHT_FIELDS = {
  bank: ["left", "level", "right"],
  pitch: ["climb", "level", "descend"],
  speed: ["slow", "cruise", "fast"],
  altitude: ["low", "mid", "high"],
} as const;

const TOUR_FIELDS = {
  move: ["stand", "walk"],
  turn: ["none", "left", "right"],
  gaze: ["ahead", "up"],
} as const;

const ENVIRONMENT_FIELDS = {
  timeOfDay: ["dawn", "day", "sunset", "night"],
  weather: ["clear", "cloudy", "rain", "storm", "fog", "snow"],
} as const;

type Group = "flight" | "tour" | "environment";

const NEUTRAL: Record<Group, Record<string, string>> = {
  flight: { bank: "level", pitch: "level", speed: "cruise", altitude: "mid" },
  tour: { move: "stand", turn: "none", gaze: "ahead" },
  environment: { timeOfDay: "day", weather: "clear" },
};

const PLACE_NAMES = [
  "paris",
  "tokyo",
  "los angeles",
  "new york",
  "boston",
  "venice",
];

const NEGATION = /\b(?:no|not|never|without)\b|\bdon['’]?t\b/i;

const FIREWORKS: SimEvent = {
  id: "fireworks",
  label: "Fireworks",
  prompt: "Fireworks burst in bright colors across the sky ahead.",
};

function clone(state: SimState): SimState {
  return JSON.parse(JSON.stringify(state)) as SimState;
}

function base(mode: SimMode): SimState {
  return { ...clone(INITIAL_STATE), mode };
}

function withField(
  state: SimState,
  group: Group,
  key: string,
  value: string,
): SimState {
  const next = clone(state) as unknown as Record<
    Group,
    Record<string, string>
  >;
  next[group][key] = value;
  return next as unknown as SimState;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The rules every steer sentence must satisfy. */
function expectSteerRules(sentence: unknown) {
  expect(typeof sentence).toBe("string");
  const text = sentence as string;
  expect(text.trim().length).toBeGreaterThan(0);
  expect(wordCount(text)).toBeLessThan(40);
  expect(text).not.toMatch(NEGATION);
  // One sentence: no sentence terminator followed by more text.
  expect(text.trim()).not.toMatch(/[.!?]["')\]]?\s+\S/);
  const lower = text.toLowerCase();
  for (const place of PLACE_NAMES) expect(lower).not.toContain(place);
}

interface FieldCase {
  mode: SimMode;
  group: Group;
  key: string;
  from: string;
  to: string;
}

function casesFor(
  mode: SimMode,
  group: Group,
  fields: Record<string, readonly string[]>,
): FieldCase[] {
  const cases: FieldCase[] = [];
  for (const [key, values] of Object.entries(fields)) {
    for (const from of values) {
      for (const to of values) {
        if (from !== to) cases.push({ mode, group, key, from, to });
      }
    }
  }
  return cases;
}

const RELEVANT_CASES: FieldCase[] = [
  ...casesFor("flight", "flight", FLIGHT_FIELDS),
  ...casesFor("flight", "environment", ENVIRONMENT_FIELDS),
  ...casesFor("tour", "tour", TOUR_FIELDS),
  ...casesFor("tour", "environment", ENVIRONMENT_FIELDS),
];

const IRRELEVANT_CASES: FieldCase[] = [
  ...casesFor("flight", "tour", TOUR_FIELDS),
  ...casesFor("tour", "flight", FLIGHT_FIELDS),
];

function single(mode: SimMode, group: Group, key: string, to: string): string {
  const prev = base(mode);
  const steer = compileSteer(prev, withField(prev, group, key, to));
  if (steer === null) {
    throw new Error(`no steer for ${mode} ${group}.${key} -> ${to}`);
  }
  return steer;
}

describe("INITIAL_STATE", () => {
  it("is flight mode with every control neutral, day, clear and no event", () => {
    expect(INITIAL_STATE).toEqual({
      mode: "flight",
      flight: { bank: "level", pitch: "level", speed: "cruise", altitude: "mid" },
      tour: { move: "stand", turn: "none", gaze: "ahead" },
      environment: { timeOfDay: "day", weather: "clear" },
      event: null,
    });
  });
});

describe("equal states", () => {
  it.each(["flight", "tour"] as const)(
    "%s mode: compileSteer is null and the queue is empty",
    (mode) => {
      const state = base(mode);
      expect(compileSteer(state, clone(state))).toBeNull();
      expect(compileSteerQueue(state, clone(state))).toEqual([]);
    },
  );

  it("non-neutral equal states with the same event give no steer", () => {
    const state: SimState = {
      mode: "flight",
      flight: { bank: "left", pitch: "climb", speed: "fast", altitude: "high" },
      tour: { move: "walk", turn: "right", gaze: "up" },
      environment: { timeOfDay: "night", weather: "storm" },
      event: { ...FIREWORKS },
    };
    expect(compileSteer(state, clone(state))).toBeNull();
    expect(compileSteerQueue(state, clone(state))).toEqual([]);
  });

  it("INITIAL_STATE against itself gives no steer", () => {
    expect(compileSteer(INITIAL_STATE, INITIAL_STATE)).toBeNull();
    expect(compileSteerQueue(INITIAL_STATE, INITIAL_STATE)).toEqual([]);
  });
});

describe("single-field changes", () => {
  it.each(RELEVANT_CASES)(
    "$mode mode: $group.$key $from -> $to yields exactly one sentence",
    ({ mode, group, key, from, to }) => {
      const prev = withField(base(mode), group, key, from);
      const next = withField(prev, group, key, to);
      const queue = compileSteerQueue(prev, next);
      expect(queue).toHaveLength(1);
      expectSteerRules(queue[0]);
      expect(compileSteer(prev, next)).toBe(queue[0]);
    },
  );

  it("returning each control to neutral yields a sentence", () => {
    const groupsByMode: [SimMode, Group, Record<string, readonly string[]>][] =
      [
        ["flight", "flight", FLIGHT_FIELDS],
        ["flight", "environment", ENVIRONMENT_FIELDS],
        ["tour", "tour", TOUR_FIELDS],
        ["tour", "environment", ENVIRONMENT_FIELDS],
      ];
    let checked = 0;
    for (const [mode, group, fields] of groupsByMode) {
      for (const [key, values] of Object.entries(fields)) {
        const neutral = NEUTRAL[group][key];
        for (const from of values) {
          if (from === neutral) continue;
          const prev = withField(base(mode), group, key, from);
          const next = withField(prev, group, key, neutral);
          const label = `${mode} ${group}.${key} ${from} -> ${neutral}`;
          expect(compileSteerQueue(prev, next), label).toHaveLength(1);
          expectSteerRules(compileSteer(prev, next));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(8 + 8 + 4 + 8);
  });

  it("different target values of one field give different sentences", () => {
    const groupsByMode: [SimMode, Group, Record<string, readonly string[]>][] =
      [
        ["flight", "flight", FLIGHT_FIELDS],
        ["flight", "environment", ENVIRONMENT_FIELDS],
        ["tour", "tour", TOUR_FIELDS],
      ];
    for (const [mode, group, fields] of groupsByMode) {
      for (const [key, values] of Object.entries(fields)) {
        const sentences = values.map((to) => {
          const from = values.find((value) => value !== to) as string;
          const prev = withField(base(mode), group, key, from);
          return compileSteer(prev, withField(prev, group, key, to));
        });
        expect(new Set(sentences).size, `${group}.${key}`).toBe(values.length);
      }
    }
  });

  it("is deterministic", () => {
    const prev = base("flight");
    const next = withField(prev, "flight", "bank", "left");
    expect(compileSteer(prev, next)).toBe(compileSteer(prev, next));
    expect(compileSteerQueue(prev, next)).toEqual(compileSteerQueue(prev, next));
  });
});

describe("mode relevance", () => {
  it.each(IRRELEVANT_CASES)(
    "$mode mode ignores $group.$key $from -> $to",
    ({ mode, group, key, from, to }) => {
      const prev = withField(base(mode), group, key, from);
      const next = withField(prev, group, key, to);
      expect(compileSteerQueue(prev, next)).toEqual([]);
      expect(compileSteer(prev, next)).toBeNull();
    },
  );

  it("flight mode emits only the flight change when both groups changed", () => {
    const prev = base("flight");
    const next: SimState = {
      ...prev,
      flight: { ...prev.flight, bank: "left" },
      tour: { move: "walk", turn: "left", gaze: "up" },
    };
    expect(compileSteerQueue(prev, next)).toEqual([
      single("flight", "flight", "bank", "left"),
    ]);
  });

  it("tour mode emits only the tour change when both groups changed", () => {
    const prev = base("tour");
    const next: SimState = {
      ...prev,
      flight: { bank: "right", pitch: "climb", speed: "fast", altitude: "high" },
      tour: { ...prev.tour, move: "walk" },
    };
    expect(compileSteerQueue(prev, next)).toEqual([
      single("tour", "tour", "move", "walk"),
    ]);
  });
});

describe("events", () => {
  it.each(["flight", "tour"] as const)(
    "%s mode: a new event yields one sentence carrying the event prompt",
    (mode) => {
      const prev = base(mode);
      const next: SimState = { ...prev, event: { ...FIREWORKS } };
      const queue = compileSteerQueue(prev, next);
      expect(queue).toHaveLength(1);
      expectSteerRules(queue[0]);
      expect(queue[0]).toContain(
        "Fireworks burst in bright colors across the sky ahead",
      );
      expect(compileSteer(prev, next)).toBe(queue[0]);
    },
  );

  it("a different event replaces the previous one with a new sentence", () => {
    const prev: SimState = { ...base("flight"), event: { ...FIREWORKS } };
    const turbulence: SimEvent = {
      id: "turbulence",
      label: "Turbulence",
      prompt: "Strong turbulence shakes the aircraft and the view jolts.",
    };
    const queue = compileSteerQueue(prev, { ...prev, event: turbulence });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toContain("Strong turbulence shakes the aircraft");
  });

  it("clearing an event yields no sentence", () => {
    const prev: SimState = { ...base("flight"), event: { ...FIREWORKS } };
    const next: SimState = { ...prev, event: null };
    expect(compileSteerQueue(prev, next)).toEqual([]);
    expect(compileSteer(prev, next)).toBeNull();
  });

  it("an over-long event prompt is still sent as a steer under 40 words", () => {
    const longPrompt = `${Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ")}.`;
    const prev = base("flight");
    const next: SimState = {
      ...prev,
      event: { id: "long", label: "Long", prompt: longPrompt },
    };
    const queue = compileSteerQueue(prev, next);
    expect(queue).toHaveLength(1);
    expect(wordCount(queue[0])).toBeLessThan(40);
  });
});

describe("queue priority", () => {
  it("flight: event first, then controls, then environment", () => {
    const prev = base("flight");
    const next: SimState = {
      ...prev,
      flight: { ...prev.flight, bank: "left", pitch: "climb" },
      environment: { timeOfDay: "sunset", weather: "storm" },
      event: { ...FIREWORKS },
    };
    const queue = compileSteerQueue(prev, next);
    expect(queue).toHaveLength(5);
    queue.forEach(expectSteerRules);
    expect(queue[0]).toContain("Fireworks burst");
    expect(compileSteer(prev, next)).toBe(queue[0]);

    const controls = [
      single("flight", "flight", "bank", "left"),
      single("flight", "flight", "pitch", "climb"),
    ];
    const environment = [
      single("flight", "environment", "timeOfDay", "sunset"),
      single("flight", "environment", "weather", "storm"),
    ];
    expect([...queue.slice(1, 3)].sort()).toEqual([...controls].sort());
    expect([...queue.slice(3)].sort()).toEqual([...environment].sort());
  });

  it("tour: event first, then controls, then environment", () => {
    const prev = base("tour");
    const next: SimState = {
      ...prev,
      tour: { move: "walk", turn: "left", gaze: "up" },
      environment: { timeOfDay: "night", weather: "snow" },
      event: { ...FIREWORKS },
    };
    const queue = compileSteerQueue(prev, next);
    expect(queue).toHaveLength(6);
    queue.forEach(expectSteerRules);
    expect(queue[0]).toContain("Fireworks burst");

    const controls = [
      single("tour", "tour", "move", "walk"),
      single("tour", "tour", "turn", "left"),
      single("tour", "tour", "gaze", "up"),
    ];
    const environment = [
      single("tour", "environment", "timeOfDay", "night"),
      single("tour", "environment", "weather", "snow"),
    ];
    expect([...queue.slice(1, 4)].sort()).toEqual([...controls].sort());
    expect([...queue.slice(4)].sort()).toEqual([...environment].sort());
  });

  it("a control change comes before an environment change", () => {
    const prev = base("flight");
    const next: SimState = {
      ...prev,
      flight: { ...prev.flight, speed: "fast" },
      environment: { ...prev.environment, weather: "fog" },
    };
    expect(compileSteerQueue(prev, next)).toEqual([
      single("flight", "flight", "speed", "fast"),
      single("flight", "environment", "weather", "fog"),
    ]);
    expect(compileSteer(prev, next)).toBe(
      single("flight", "flight", "speed", "fast"),
    );
  });

  it("all four flight controls changed at once give four sentences", () => {
    const prev = base("flight");
    const next: SimState = {
      ...prev,
      flight: { bank: "right", pitch: "descend", speed: "slow", altitude: "low" },
    };
    const queue = compileSteerQueue(prev, next);
    expect(queue).toHaveLength(4);
    expect(new Set(queue).size).toBe(4);
    queue.forEach(expectSteerRules);
  });
});

describe("applyDelta", () => {
  it("applies valid fields from every group", () => {
    const result = applyDelta(INITIAL_STATE, {
      flight: { bank: "left", altitude: "high" },
      tour: { move: "walk" },
      environment: { weather: "storm" },
      event: { ...FIREWORKS },
    });
    expect(result).toEqual({
      mode: "flight",
      flight: { bank: "left", pitch: "level", speed: "cruise", altitude: "high" },
      tour: { move: "walk", turn: "none", gaze: "ahead" },
      environment: { timeOfDay: "day", weather: "storm" },
      event: FIREWORKS,
    });
  });

  it("does not mutate the input state or the delta", () => {
    const state = deepFreeze(clone(INITIAL_STATE));
    const delta = deepFreeze<SimStateDelta>({
      flight: { bank: "left" },
      environment: { timeOfDay: "night" },
      event: { ...FIREWORKS },
    });
    const before = JSON.stringify(state);
    const result = applyDelta(state, delta);
    expect(JSON.stringify(state)).toBe(before);
    expect(result).not.toBe(state);
    expect(result.flight).not.toBe(state.flight);
    expect(result.environment).not.toBe(state.environment);
    expect(result.flight.bank).toBe("left");
    expect(result.environment.timeOfDay).toBe("night");
  });

  it("an empty delta returns an equal state that is a new object", () => {
    const state = deepFreeze({
      ...clone(INITIAL_STATE),
      event: { ...FIREWORKS },
    });
    const result = applyDelta(state, {});
    expect(result).toEqual(state);
    expect(result).not.toBe(state);
  });

  it("leaves INITIAL_STATE untouched", () => {
    const before = JSON.stringify(INITIAL_STATE);
    applyDelta(INITIAL_STATE, {
      flight: { bank: "right", pitch: "climb", speed: "fast", altitude: "low" },
      tour: { move: "walk", turn: "left", gaze: "up" },
      environment: { timeOfDay: "night", weather: "snow" },
      event: { ...FIREWORKS },
    });
    expect(JSON.stringify(INITIAL_STATE)).toBe(before);
  });

  it("ignores unknown keys at the top level and inside groups", () => {
    const delta = {
      bogus: 1,
      flight: { bank: "left", warp: 9 },
      tour: { hop: true },
      environment: { season: "winter" },
    } as unknown as SimStateDelta;
    const result = applyDelta(INITIAL_STATE, delta);
    expect(result).toEqual({
      ...INITIAL_STATE,
      flight: { ...INITIAL_STATE.flight, bank: "left" },
    });
    expect(Object.keys(result).sort()).toEqual(
      ["environment", "event", "flight", "mode", "tour"].sort(),
    );
    expect(Object.keys(result.flight).sort()).toEqual(
      ["altitude", "bank", "pitch", "speed"].sort(),
    );
  });

  it("ignores `mode`, which is not part of a delta", () => {
    const delta = { mode: "tour" } as unknown as SimStateDelta;
    expect(applyDelta(INITIAL_STATE, delta).mode).toBe("flight");
  });

  it("ignores invalid enum values and keeps valid ones in the same delta", () => {
    const delta = {
      flight: { bank: "upside-down", pitch: "climb", speed: 3, altitude: null },
      tour: { move: "run", turn: "LEFT", gaze: "" },
      environment: { weather: "tornado", timeOfDay: "sunset" },
    } as unknown as SimStateDelta;
    const result = applyDelta(INITIAL_STATE, delta);
    expect(result.flight).toEqual({
      bank: "level",
      pitch: "climb",
      speed: "cruise",
      altitude: "mid",
    });
    expect(result.tour).toEqual(INITIAL_STATE.tour);
    expect(result.environment).toEqual({ timeOfDay: "sunset", weather: "clear" });
  });

  it("does not let a value from one field leak into another", () => {
    // "level" is valid for bank and pitch but not for speed or altitude.
    const delta = {
      flight: { speed: "level", altitude: "level", bank: "climb" },
    } as unknown as SimStateDelta;
    expect(applyDelta(INITIAL_STATE, delta).flight).toEqual(INITIAL_STATE.flight);
  });

  it("sets, keeps and clears the event", () => {
    const withEvent = applyDelta(INITIAL_STATE, { event: { ...FIREWORKS } });
    expect(withEvent.event).toEqual(FIREWORKS);
    expect(applyDelta(withEvent, { flight: { bank: "left" } }).event).toEqual(
      FIREWORKS,
    );
    expect(applyDelta(withEvent, { event: null }).event).toBeNull();
  });

  it("does not throw on malformed groups and leaves the state as it was", () => {
    const malformed = [
      { flight: null },
      { flight: "left" },
      { tour: 5 },
      { environment: ["storm"] },
      { event: "fireworks" },
      { event: { id: "x" } },
      { event: { id: "x", label: "X", prompt: 42 } },
    ] as unknown as SimStateDelta[];
    for (const delta of malformed) {
      const result = applyDelta(INITIAL_STATE, delta);
      expect(result, JSON.stringify(delta)).toEqual(INITIAL_STATE);
    }
  });
});

describe("compileKickoff", () => {
  it.each(["flight", "tour"] as const)(
    "%s mode: includes the place name and stays under about 100 words",
    (mode) => {
      const prompt = compileKickoff("Santorini", base(mode));
      expect(prompt).toContain("Santorini");
      expect(wordCount(prompt)).toBeGreaterThan(8);
      expect(wordCount(prompt)).toBeLessThanOrEqual(100);
      expect(prompt).not.toMatch(NEGATION);
    },
  );

  it("keeps a multi-word place name intact", () => {
    expect(compileKickoff("Golden Gate Bridge", base("flight"))).toContain(
      "Golden Gate Bridge",
    );
  });

  it("gives different prompts for flight and tour", () => {
    expect(compileKickoff("Santorini", base("flight"))).not.toBe(
      compileKickoff("Santorini", base("tour")),
    );
  });

  it("stays under about 100 words in the wordiest state of each mode", () => {
    const fields = {
      flight: FLIGHT_FIELDS,
      tour: TOUR_FIELDS,
      environment: ENVIRONMENT_FIELDS,
    } as const;
    for (const mode of ["flight", "tour"] as const) {
      let longest = 0;
      for (const timeOfDay of fields.environment.timeOfDay) {
        for (const weather of fields.environment.weather) {
          for (const bank of fields.flight.bank) {
            for (const pitch of fields.flight.pitch) {
              for (const turn of fields.tour.turn) {
                const state: SimState = {
                  mode,
                  flight: { bank, pitch, speed: "slow", altitude: "high" },
                  tour: { move: "walk", turn, gaze: "up" },
                  environment: { timeOfDay, weather },
                  event: null,
                };
                const prompt = compileKickoff(
                  "Santorini Old Town Harbor",
                  state,
                );
                expect(prompt).toContain("Santorini Old Town Harbor");
                expect(prompt).not.toMatch(NEGATION);
                longest = Math.max(longest, wordCount(prompt));
              }
            }
          }
        }
      }
      expect(longest, `${mode} longest kickoff`).toBeLessThanOrEqual(100);
    }
  });

  it("does not mutate the state", () => {
    const state = deepFreeze(base("flight"));
    const before = JSON.stringify(state);
    compileKickoff("Santorini", state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
