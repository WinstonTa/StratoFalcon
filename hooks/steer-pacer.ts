/**
 * Pacing rules for steer prompts. Pure and clock-injected so they can be
 * tested without React or a Reactor session.
 *
 * Orbis picks up the newest prompt at a chunk boundary (one chunk is 33 frames
 * at 18 fps, about 1.83 s). Two prompts sent inside the same chunk interval
 * mean the first one never drives a chunk, so:
 *
 *  1. While `chunk_complete` events are flowing, steers go out ONLY at chunk
 *     boundaries.
 *  2. The timer fallback may send only when no chunk boundary has been seen for
 *     longer than CHUNK_SILENCE_MS (the chunk clock cannot be trusted).
 *  3. In every case, no steer leaves within MIN_SEND_GAP_MS of the previous one.
 */

export const CHUNK_MS = 1830;
export const MIN_SEND_GAP_MS = 1700;
export const CHUNK_SILENCE_MS = 2500;

export type SteerTrigger = "chunk" | "fallback";

export class SteerPacer {
  private lastSendAt = Number.NEGATIVE_INFINITY;
  private lastChunkAt: number;

  constructor(now: number) {
    this.lastChunkAt = now;
  }

  /** Call when a chunk boundary is observed. */
  noteChunk(now: number) {
    this.lastChunkAt = now;
  }

  /** Whether a steer may leave right now for this trigger. */
  canSend(trigger: SteerTrigger, now: number): boolean {
    if (now - this.lastSendAt < MIN_SEND_GAP_MS) return false;
    if (trigger === "chunk") return true;
    return now - this.lastChunkAt > CHUNK_SILENCE_MS;
  }

  /** Call when a steer has actually been sent. */
  noteSend(now: number) {
    this.lastSendAt = now;
  }

  reset(now: number) {
    this.lastSendAt = Number.NEGATIVE_INFINITY;
    this.lastChunkAt = now;
  }
}
