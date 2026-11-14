/**
 * Steer pacing (hooks/steer-pacer.ts) driven the way hooks/use-steer-scheduler.ts
 * drives it: a chunk trigger on every chunk boundary, a fallback trigger 250 ms
 * after an input and then every 500 ms. Regression test for QA defect F-1 (two
 * steers leaving 0.4 s apart).
 *
 * Added by frontend-dev at the architect's request; tests/** is otherwise
 * qa-reviewer's path.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  CHUNK_MS,
  CHUNK_SILENCE_MS,
  MIN_SEND_GAP_MS,
  SteerPacer,
} from "@/hooks/steer-pacer";
import { applyFlightControl } from "@/hooks/use-flight-controls";
import { compileSteerSteps } from "@/lib/sim/prompt-compiler";
import { useSimStore } from "@/lib/sim/store";
import type { Destination } from "@/lib/sim/types";

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
}

/**
 * Runs the scheduler's send loop on a virtual clock. `chunkPhase` is how long
 * after the inputs the first chunk boundary lands; `chunks: false` simulates a
 * silent chunk clock.
 */
function simulate({
  chunkPhase,
  chunks = true,
  durationMs = 12_000,
}: {
  chunkPhase: number;
  chunks?: boolean;
  durationMs?: number;
}): Sent[] {
  const pacer = new SteerPacer(0);
  const sent: Sent[] = [];

  const attempt = (trigger: "chunk" | "fallback", now: number) => {
    const { state, lastSentState } = store();
    const step = compileSteerSteps(lastSentState, state)[0];
    if (!step) return;
    if (!pacer.canSend(trigger, now)) return;
    pacer.noteSend(now);
    sent.push({ at: now, prompt: step.prompt });
    store().advanceLastSent(step.delta);
    if (step.delta.event) store().clearEvent();
  };

  // Three inputs in the same instant, as in the demo script.
  applyFlightControl("bank-left");
  applyFlightControl("climb");
  applyFlightControl("faster");

  for (let now = 0; now <= durationMs; now += 10) {
    const isChunk = chunks && now >= chunkPhase && (now - chunkPhase) % CHUNK_MS === 0;
    if (isChunk) {
      pacer.noteChunk(now);
      attempt("chunk", now);
    }
    // Debounce 250 ms after the input, then the 500 ms watchdog.
    if (now === 250 || (now > 0 && now % 500 === 0)) attempt("fallback", now);
  }
  return sent;
}

function gaps(sent: Sent[]) {
  return sent.slice(1).map((entry, index) => entry.at - sent[index].at);
}

beforeEach(() => {
  store().reset();
  store().beginFlight(DESTINATION);
});

describe("steer pacing", () => {
  it("sends three simultaneous inputs at least one chunk apart, at any chunk phase", () => {
    for (let chunkPhase = 0; chunkPhase < CHUNK_MS; chunkPhase += 30) {
      store().reset();
      store().beginFlight(DESTINATION);
      const sent = simulate({ chunkPhase });
      expect(sent, `phase ${chunkPhase}`).toHaveLength(3);
      for (const gap of gaps(sent)) {
        expect(gap, `phase ${chunkPhase}`).toBeGreaterThanOrEqual(CHUNK_MS);
      }
    }
  });

  it("sends only on chunk boundaries while chunks are flowing", () => {
    const chunkPhase = 400;
    const sent = simulate({ chunkPhase });
    for (const entry of sent) {
      expect((entry.at - chunkPhase) % CHUNK_MS).toBe(0);
    }
  });

  it("falls back to the timer when the chunk clock is silent, still spaced out", () => {
    const sent = simulate({ chunkPhase: 0, chunks: false });
    expect(sent).toHaveLength(3);
    expect(sent[0].at).toBeGreaterThan(CHUNK_SILENCE_MS);
    for (const gap of gaps(sent)) {
      expect(gap).toBeGreaterThanOrEqual(MIN_SEND_GAP_MS);
    }
  });

  it("refuses a second steer inside the minimum gap even on a chunk trigger", () => {
    const pacer = new SteerPacer(0);
    expect(pacer.canSend("chunk", 100)).toBe(true);
    pacer.noteSend(100);
    expect(pacer.canSend("chunk", 100 + MIN_SEND_GAP_MS - 1)).toBe(false);
    expect(pacer.canSend("chunk", 100 + MIN_SEND_GAP_MS)).toBe(true);
  });
});
