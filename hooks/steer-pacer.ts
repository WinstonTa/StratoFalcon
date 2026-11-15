/**
 * Pacing for steer prompts. Pure and clock-injected so it can be tested
 * without React or a Reactor session.
 *
 * The Orbis prompt guide says each set_prompt replaces the active prompt, a
 * change needs 2–4 s to land, and a new action every 500 ms "just queues
 * competing morphs". So steering is last-write-wins with a slow, steady beat:
 *
 *  1. No queue. A send always carries the whole current motion, compiled once
 *     from the latest state.
 *  2. The first change after a quiet period leaves after DEBOUNCE_MS, so keys
 *     pressed together become one prompt.
 *  3. After any send, the next one waits until MIN_SEND_GAP_MS has passed, then
 *     the latest state goes out once if it still differs.
 */

import { compileMotionPrompt } from "@/lib/sim/prompt-compiler";
import { statesEqual, useSimStore } from "@/lib/sim/store";
import type { SimState } from "@/lib/sim/types";

/** One Orbis chunk: 33 frames at 18 fps. */
export const CHUNK_MS = 1830;
export const DEBOUNCE_MS = 80;
export const MIN_SEND_GAP_MS = 1200;

export interface SteerClock {
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

const realClock: SteerClock = {
  now: () => Date.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class SteerPacer {
  private timer: unknown = null;
  private lastSendAt = Number.NEGATIVE_INFINITY;

  /**
   * @param flush Send the latest state now. Returns false when there turned
   *   out to be nothing to send.
   * @param onHold Called with the time a send is being held until when pacing
   *   delays it beyond the debounce, and with null once it is released.
   */
  constructor(
    private readonly flush: () => boolean,
    private readonly onHold: (until: number | null) => void = () => {},
    private readonly clock: SteerClock = realClock,
  ) {}

  /** Call whenever the state differs from what Orbis was last told. */
  notify() {
    if (this.timer !== null) return;
    const now = this.clock.now();
    const sendAt = Math.max(
      now + DEBOUNCE_MS,
      this.lastSendAt + MIN_SEND_GAP_MS,
    );
    if (sendAt - now > DEBOUNCE_MS) this.onHold(sendAt);
    this.timer = this.clock.setTimer(() => {
      this.timer = null;
      this.onHold(null);
      if (this.flush()) this.lastSendAt = this.clock.now();
    }, sendAt - now);
  }

  /** Drop a scheduled send, e.g. when the view goes away. */
  cancel() {
    if (this.timer !== null) {
      this.clock.clearTimer(this.timer);
      this.timer = null;
    }
    this.onHold(null);
  }

  /** A new run: the next change may leave after the debounce alone. */
  reset() {
    this.cancel();
    this.lastSendAt = Number.NEGATIVE_INFINITY;
  }
}

/** Whether Orbis has yet to be told about the current state. */
export function hasPendingSteer() {
  const { state, lastSentState, resendRequested } = useSimStore.getState();
  return resendRequested || !statesEqual(lastSentState, state);
}

export interface SteerTaken {
  /** The exact text for `set_prompt`. */
  prompt: string;
  /** The state this prompt was compiled for; confirm it once it is applied. */
  state: SimState;
}

/**
 * Compiles the ONE prompt for the latest state and marks that state as sent.
 * Returns null when nothing differs, or when the compiled text is identical
 * to `lastPrompt` (the last prompt actually sent) and carries no event.
 *
 * The prompt is compiled against the last CONFIRMED state, not the last sent
 * one. The motion sentence always describes the whole current motion; a
 * weather, light or event sentence appears only as a change from the
 * confirmed baseline, so it keeps being included until a prompt carrying it
 * has really driven a chunk. Otherwise a quick follow-up prompt would replace
 * it before Orbis ran it and the change would be lost.
 */
export function takeNextSteer(lastPrompt: string | null): SteerTaken | null {
  const store = useSimStore.getState();
  if (
    !store.resendRequested &&
    statesEqual(store.lastSentState, store.state)
  ) {
    return null;
  }
  const state = store.state;
  // Turn-sense calibration only changes the wording, never the state.
  const prompt = compileMotionPrompt(state, store.confirmedState, {
    invertTurn: store.invertTurn,
  }).trim();
  store.markStateSent();
  if (!prompt) return null;
  // De-duplicate identical text, but never a prompt that carries an event:
  // an event still in state is unconfirmed (or was just pressed again), and
  // dropping it would leave it unsent and never retired.
  if (prompt === lastPrompt && !state.event) return null;
  return { prompt, state };
}
