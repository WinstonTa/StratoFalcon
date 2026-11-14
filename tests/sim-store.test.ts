/**
 * Store and compiler together, without React: the loop the steer scheduler is
 * specified to run (master doc section 3.4). On each chunk boundary it sends
 * the first pending sentence, advances lastSentState by that one change, and
 * clears a one-shot event once it has been sent.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { compileSteerSteps } from "@/lib/sim/prompt-compiler";
import { statesEqual, useSimStore } from "@/lib/sim/store";
import type { Destination, SimEvent } from "@/lib/sim/types";

const DESTINATION: Destination = {
  id: "test-place",
  name: "Test Place",
  tagline: "A place for tests",
  aerialImage: "/destinations/test-place/aerial.png",
  groundImage: "/destinations/test-place/ground.png",
  aerialKickoff: "An aerial view over a test place.",
  groundKickoff: "A street in a test place.",
  guideFacts: ["one", "two", "three"],
};

const FIREWORKS: SimEvent = {
  id: "fireworks",
  label: "Fireworks",
  prompt: "Fireworks burst in bright colors across the sky ahead.",
};

const store = () => useSimStore.getState();

/** One chunk boundary as the scheduler is specified. Returns the prompt sent. */
function tick(): string | null {
  const { state, lastSentState } = store();
  const step = compileSteerSteps(lastSentState, state)[0];
  if (!step) return null;
  store().advanceLastSent(step.delta);
  if (step.delta.event) store().clearEvent();
  return step.prompt;
}

function drain(limit = 20): string[] {
  const sent: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    const prompt = tick();
    if (prompt === null) return sent;
    sent.push(prompt);
  }
  throw new Error(`queue did not drain in ${limit} chunks: ${sent.join(" | ")}`);
}

beforeEach(() => {
  store().reset();
  store().beginFlight(DESTINATION);
});

describe("sim store", () => {
  it("beginFlight arms a fresh flight", () => {
    const s = store();
    expect(s.phase).toBe("preparing");
    expect(s.destination).toEqual(DESTINATION);
    expect(s.state.mode).toBe("flight");
    expect(statesEqual(s.state, s.lastSentState)).toBe(true);
    expect(s.missionLog).toHaveLength(1);
    expect(s.missionLog[0].text).toContain("Test Place");
  });

  it("applyDelta changes state, logs the change and leaves lastSentState", () => {
    store().applyDelta({ flight: { bank: "left" } });
    const s = store();
    expect(s.state.flight.bank).toBe("left");
    expect(s.lastSentState.flight.bank).toBe("level");
    expect(statesEqual(s.state, s.lastSentState)).toBe(false);
    const last = s.missionLog[s.missionLog.length - 1];
    expect(last.kind).toBe("state");
    expect(last.text).toContain("bank");
    expect(last.text).toContain("left");
  });

  it("a delta that changes nothing adds no log entry", () => {
    const before = store().missionLog.length;
    store().applyDelta({ flight: { bank: "level" } });
    store().applyDelta({});
    expect(store().missionLog).toHaveLength(before);
  });

  it("reset returns to an idle, empty store", () => {
    store().applyDelta({ flight: { bank: "left" }, event: { ...FIREWORKS } });
    store().reset();
    const s = store();
    expect(s.phase).toBe("idle");
    expect(s.destination).toBeNull();
    expect(s.state.flight.bank).toBe("level");
    expect(s.state.event).toBeNull();
    expect(s.missionLog).toEqual([]);
    expect(statesEqual(s.state, s.lastSentState)).toBe(true);
  });
});

describe("scheduler loop over the store", () => {
  it("sends nothing when state equals lastSentState", () => {
    expect(tick()).toBeNull();
  });

  it("drains one change per chunk and converges", () => {
    store().applyDelta({ flight: { bank: "left", pitch: "climb" } });
    store().applyDelta({ environment: { weather: "storm" } });
    const sent = drain();
    expect(sent).toHaveLength(3);
    expect(new Set(sent).size).toBe(3);
    const s = store();
    expect(statesEqual(s.state, s.lastSentState)).toBe(true);
    expect(s.state.flight).toEqual({
      bank: "left",
      pitch: "climb",
      speed: "cruise",
      altitude: "mid",
    });
    expect(s.state.environment.weather).toBe("storm");
  });

  it("sends an event first, then clears it from both states", () => {
    store().applyDelta({ flight: { bank: "right" } });
    store().applyDelta({ event: { ...FIREWORKS } });
    const sent = drain();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("Fireworks burst");
    const s = store();
    expect(s.state.event).toBeNull();
    expect(s.lastSentState.event).toBeNull();
    expect(s.state.flight.bank).toBe("right");
    expect(statesEqual(s.state, s.lastSentState)).toBe(true);
  });

  it("the same event can be triggered again after it has been sent", () => {
    store().applyDelta({ event: { ...FIREWORKS } });
    expect(drain()).toHaveLength(1);
    store().applyDelta({ event: { ...FIREWORKS } });
    const again = drain();
    expect(again).toHaveLength(1);
    expect(again[0]).toContain("Fireworks burst");
  });

  it("a control toggled away and back before the chunk sends nothing", () => {
    store().applyDelta({ flight: { bank: "left" } });
    store().applyDelta({ flight: { bank: "level" } });
    expect(drain()).toEqual([]);
  });

  it("a change made while the queue is draining is still sent", () => {
    store().applyDelta({ flight: { bank: "left", speed: "fast" } });
    expect(tick()).not.toBeNull();
    store().applyDelta({ flight: { bank: "right" } });
    drain();
    const s = store();
    expect(s.lastSentState.flight.bank).toBe("right");
    expect(s.lastSentState.flight.speed).toBe("fast");
    expect(statesEqual(s.state, s.lastSentState)).toBe(true);
  });
});

describe("mission log prompt markers", () => {
  it("marks the matching pending prompt and older pending prompts as applied", () => {
    const first = store().log("prompt", "first steer", "pending");
    const second = store().log("prompt", "second steer", "pending");
    const third = store().log("prompt", "third steer", "pending");
    store().markPromptApplied("second steer");
    const byId = new Map(store().missionLog.map((entry) => [entry.id, entry]));
    expect(byId.get(first)?.status).toBe("applied");
    expect(byId.get(second)?.status).toBe("applied");
    expect(byId.get(third)?.status).toBe("pending");
  });

  it("an unknown prompt text leaves every entry pending", () => {
    const id = store().log("prompt", "a steer", "pending");
    store().markPromptApplied("some other text");
    expect(store().missionLog.find((entry) => entry.id === id)?.status).toBe(
      "pending",
    );
  });
});
