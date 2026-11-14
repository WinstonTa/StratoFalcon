/**
 * Steer pacing (hooks/steer-pacer.ts): last-write-wins, one whole-motion
 * prompt per change, a 150 ms debounce, then at most one prompt per 1.9 s.
 * Uses the real pacer, the real store and the real compiler on fake timers;
 * only the Reactor send is replaced by a recorder, and "Orbis ran a chunk with
 * this prompt" is simulated by calling the store's confirmApplied.
 *
 * Replaces the earlier one-steer-per-chunk tests (QA defect F-1), which
 * described the queue this design removed. Written by frontend-dev at the
 * architect's request; tests/** is otherwise qa-reviewer's path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEBOUNCE_MS,
  hasPendingSteer,
  MIN_SEND_GAP_MS,
  SteerPacer,
  takeNextSteer,
} from "@/hooks/steer-pacer";
import { applyFlightControl } from "@/hooks/use-flight-controls";
import { useSimStore } from "@/lib/sim/store";
import type { Destination, SimState } from "@/lib/sim/types";

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

const store = () => useSimStore.getState();

interface Sent {
  at: number;
  prompt: string;
  /** The state the prompt was compiled for. */
  state: SimState;
}

/** The scheduler's wiring without React: store changes notify the pacer. */
function wire() {
  const sent: Sent[] = [];
  const holds: (number | null)[] = [];
  const pacer = new SteerPacer(
    () => {
      const taken = takeNextSteer(sent.at(-1)?.prompt ?? null);
      if (!taken) return false;
      sent.push({ at: Date.now(), ...taken });
      return true;
    },
    (until) => holds.push(until),
  );
  const unsubscribe = useSimStore.subscribe(() => {
    if (hasPendingSteer()) pacer.notify();
  });
  return { sent, holds, pacer, unsubscribe };
}

let wired: ReturnType<typeof wire>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  store().reset();
  store().beginFlight(DESTINATION);
  wired = wire();
});

afterEach(() => {
  wired.unsubscribe();
  wired.pacer.cancel();
  vi.useRealTimers();
});

describe("steer pacing", () => {
  it("turns three keys pressed together into ONE prompt within 200 ms", () => {
    applyFlightControl("bank-left");
    applyFlightControl("climb");
    applyFlightControl("faster");

    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(wired.sent).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(wired.sent).toHaveLength(1);
    expect(wired.sent[0].at).toBeLessThanOrEqual(200);

    // Nothing else follows: there is no queue to drain.
    vi.advanceTimersByTime(10_000);
    expect(wired.sent).toHaveLength(1);
    expect(hasPendingSteer()).toBe(false);
  });

  it("includes a key pressed during the debounce in the same prompt", () => {
    applyFlightControl("bank-left");
    vi.advanceTimersByTime(100);
    applyFlightControl("climb");
    vi.advanceTimersByTime(60);

    expect(wired.sent).toHaveLength(1);
    expect(store().lastSentState.flight).toMatchObject({
      bank: "left",
      pitch: "climb",
    });
  });

  it("holds later changes for 1.9 s and then sends only the latest state", () => {
    applyFlightControl("bank-left");
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(wired.sent).toHaveLength(1);

    // Three more changes inside the hold; the last one undoes the bank.
    vi.advanceTimersByTime(200);
    applyFlightControl("climb");
    vi.advanceTimersByTime(200);
    applyFlightControl("bank-right");
    vi.advanceTimersByTime(200);
    applyFlightControl("faster");
    expect(wired.sent).toHaveLength(1);
    expect(wired.holds.at(-1)).toBe(DEBOUNCE_MS + MIN_SEND_GAP_MS);

    vi.advanceTimersByTime(MIN_SEND_GAP_MS);
    expect(wired.sent).toHaveLength(2);
    expect(wired.sent[1].at - wired.sent[0].at).toBe(MIN_SEND_GAP_MS);
    expect(store().lastSentState.flight).toMatchObject({
      bank: "right",
      pitch: "climb",
      speed: "fast",
    });
    expect(wired.holds.at(-1)).toBeNull();
  });

  it("never sends more than one prompt per 1.9 s while keys are mashed", () => {
    const controls = ["bank-left", "climb", "bank-right", "descend"] as const;
    for (let step = 0; step < 100; step += 1) {
      applyFlightControl(controls[step % controls.length]);
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(5000);

    expect(wired.sent.length).toBeGreaterThan(1);
    expect(wired.sent.length).toBeLessThanOrEqual(7);
    for (let index = 1; index < wired.sent.length; index += 1) {
      expect(
        wired.sent[index].at - wired.sent[index - 1].at,
      ).toBeGreaterThanOrEqual(MIN_SEND_GAP_MS);
    }
    expect(hasPendingSteer()).toBe(false);
  });

  it("sends nothing when a change is undone before the debounce ends", () => {
    applyFlightControl("bank-left");
    vi.advanceTimersByTime(50);
    applyFlightControl("bank-left");
    vi.advanceTimersByTime(5000);
    expect(wired.sent).toHaveLength(0);
  });

  it("keeps a one-shot event until its prompt is confirmed, then retires it without another send", () => {
    store().applyDelta({
      event: {
        id: "fireworks-1",
        label: "Fireworks",
        prompt: "Fireworks burst in bright colors across the sky ahead.",
      },
    });
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(wired.sent).toHaveLength(1);
    expect(wired.sent[0].prompt).toContain("Fireworks burst");
    // Sent but not yet confirmed: the event is still part of the state.
    expect(store().state.event?.id).toBe("fireworks-1");
    expect(hasPendingSteer()).toBe(false);

    // Orbis runs a chunk with it.
    store().confirmApplied(wired.sent[0].state);
    expect(store().state.event).toBeNull();
    expect(store().lastSentState.event).toBeNull();

    vi.advanceTimersByTime(10_000);
    expect(wired.sent).toHaveLength(1);
  });

  it("repeats an unconfirmed event in the prompt that replaces it", () => {
    store().applyDelta({
      event: {
        id: "fireworks-1",
        label: "Fireworks",
        prompt: "Fireworks burst in bright colors across the sky ahead.",
      },
    });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    applyFlightControl("bank-left");
    vi.advanceTimersByTime(MIN_SEND_GAP_MS);

    expect(wired.sent).toHaveLength(2);
    // The first prompt was replaced before it was confirmed, so the second
    // must carry the event again or it would never be shown.
    expect(wired.sent[1].prompt).toContain("Fireworks burst");

    store().confirmApplied(wired.sent[1].state);
    applyFlightControl("climb");
    vi.advanceTimersByTime(MIN_SEND_GAP_MS);
    expect(wired.sent).toHaveLength(3);
    expect(wired.sent[2].prompt).not.toContain("Fireworks burst");
  });

  it("repeats a weather change until a prompt carrying it is confirmed", () => {
    store().applyDelta({ environment: { weather: "storm" } });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(wired.sent[0].prompt).toMatch(/weather changes/i);

    // Replaced before confirmation: the change sentence comes along again.
    applyFlightControl("bank-left");
    vi.advanceTimersByTime(MIN_SEND_GAP_MS);
    expect(wired.sent).toHaveLength(2);
    expect(wired.sent[1].prompt).toMatch(/weather changes/i);

    // Confirmed: the model keeps the weather, so it is not restated.
    store().confirmApplied(wired.sent[1].state);
    applyFlightControl("climb");
    vi.advanceTimersByTime(MIN_SEND_GAP_MS);
    expect(wired.sent).toHaveLength(3);
    expect(wired.sent[2].prompt).not.toMatch(/weather changes/i);
  });

  // Added by qa-reviewer (third pass), who owns this file from here on.
  it("fires the same event again after the first was confirmed, with nothing else changed", () => {
    const fireworks = (id: string) => ({
      id,
      label: "Fireworks",
      prompt: "Fireworks burst in bright colors across the sky ahead.",
    });

    store().applyDelta({ event: fireworks("fireworks-1") });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(wired.sent).toHaveLength(1);
    store().confirmApplied(wired.sent[0].state);
    expect(store().state.event).toBeNull();

    // Ten seconds later the viewer presses the same button again.
    vi.advanceTimersByTime(10_000);
    store().applyDelta({ event: fireworks("fireworks-2") });
    vi.advanceTimersByTime(MIN_SEND_GAP_MS);

    expect(wired.sent).toHaveLength(2);
    expect(wired.sent[1].prompt).toContain("Fireworks burst");
  });

  it("an unconfirmed weather change is still carried after several replacements", () => {
    store().applyDelta({ environment: { weather: "storm" } });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    const controls = ["bank-left", "climb", "faster"] as const;
    for (const control of controls) {
      applyFlightControl(control);
      vi.advanceTimersByTime(MIN_SEND_GAP_MS);
    }
    expect(wired.sent).toHaveLength(4);
    for (const entry of wired.sent) {
      expect(entry.prompt).toMatch(/weather changes from clear skies/i);
    }
  });

  it("does not resend an identical prompt", () => {
    applyFlightControl("bank-left");
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(wired.sent).toHaveLength(1);
    // Out and back to the same state inside one pacing window.
    applyFlightControl("climb");
    applyFlightControl("climb");
    vi.advanceTimersByTime(MIN_SEND_GAP_MS * 2);
    expect(wired.sent).toHaveLength(1);
  });
});
