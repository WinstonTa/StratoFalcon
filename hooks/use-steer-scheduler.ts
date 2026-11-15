"use client";

import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef } from "react";

import {
  CHUNK_MS,
  hasPendingSteer,
  SteerPacer,
  takeNextSteer,
} from "@/hooks/steer-pacer";
import { unwrapOrbisMessage } from "@/lib/orbis";
import { useSimStore } from "@/lib/sim/store";
import type { SimState } from "@/lib/sim/types";

/** If active_prompt never matches, treat an acknowledged steer as applied after this many chunks. */
const APPLIED_FALLBACK_CHUNKS = 3;
/** With no acknowledgement either, give up waiting after this many chunks. */
const APPLIED_LAST_RESORT_CHUNKS = 5;

interface SentSteer {
  prompt: string;
  /** The state the prompt was compiled for. */
  state: SimState;
  acknowledged: boolean;
  chunksSinceSent: number;
}

/**
 * Keeps the model in step with the simulation state, last-write-wins.
 *
 * When `state` differs from `lastSentState`, ONE prompt is compiled for the
 * latest state (the whole camera motion, plus any weather, light or event not
 * yet confirmed) and sent with `set_prompt`; `lastSentState` then becomes
 * `state`. There is no queue and no waiting for a chunk boundary. Pacing
 * (a short debounce, then a minimum gap between prompts) and the confirmed
 * baseline rule live in hooks/steer-pacer.ts.
 *
 * `chunk_complete` is used to confirm prompts: a confirmed prompt turns from
 * Pending to Applied in the log and its state becomes the new baseline. `dryRun` logs prompts without sending them and ticks its own clock.
 */
export function useSteerScheduler({
  enabled,
  dryRun,
}: {
  enabled: boolean;
  dryRun: boolean;
}) {
  const sendCommand = useReactor((reactor) => reactor.sendCommand);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const sent = useRef<SentSteer[]>([]);
  // The last prompt actually sent in this run, for de-duplication.
  const lastPrompt = useRef<string | null>(null);

  const flush = useCallback((): boolean => {
    if (!enabledRef.current) return false;
    const taken = takeNextSteer(lastPrompt.current);
    if (!taken) return false;
    const { prompt } = taken;
    lastPrompt.current = prompt;

    const record: SentSteer = {
      prompt,
      state: taken.state,
      acknowledged: dryRun,
      chunksSinceSent: 0,
    };
    sent.current.push(record);
    useSimStore.getState().log("prompt", prompt, "pending");

    if (!dryRun) {
      // sendCommand never rejects; a refusal comes back as command_error.
      void sendCommand("set_prompt", { prompt }).then((raw) => {
        if (!raw) return;
        const reply = unwrapOrbisMessage(raw);
        if (reply.type === "prompt_accepted") {
          record.acknowledged = true;
        } else if (reply.type === "command_error") {
          sent.current = sent.current.filter((entry) => entry !== record);
          useSimStore
            .getState()
            .log(
              "system",
              `Orbis refused the steer: ${reply.reason || "no reason given"}`,
            );
        }
      });
    }
    return true;
  }, [dryRun, sendCommand]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  const pacer = useRef<SteerPacer | null>(null);
  pacer.current ??= new SteerPacer(
    () => flushRef.current(),
    (until) => useSimStore.getState().setSteerHold(until),
  );

  // Watch the state while the view is live.
  useEffect(() => {
    const current = pacer.current;
    if (!enabled || !current) return;

    current.reset();
    lastPrompt.current = null;
    // Anything already different (weather carried across a landing, say).
    if (hasPendingSteer()) current.notify();
    const unsubscribe = useSimStore.subscribe((next, previous) => {
      if (
        next.state === previous.state &&
        next.lastSentState === previous.lastSentState &&
        next.resendRequested === previous.resendRequested
      ) {
        return;
      }
      if (hasPendingSteer()) current.notify();
    });
    return () => {
      unsubscribe();
      current.cancel();
      sent.current = [];
    };
  }, [enabled]);

  /**
   * A chunk boundary: work out which sent prompts have now driven a chunk.
   * Those turn Applied in the log and their state becomes the confirmed
   * baseline (which also retires a one-shot event they carried).
   */
  const onChunk = useCallback((activePrompt: string | null | undefined) => {
    const { markPromptApplied, confirmApplied } = useSimStore.getState();
    const active = typeof activePrompt === "string" ? activePrompt.trim() : null;

    const remaining: SentSteer[] = [];
    let appliedThrough = -1;
    sent.current.forEach((record, index) => {
      record.chunksSinceSent += 1;
      const matches = active !== null && record.prompt === active;
      // Stable does not report active_prompt: an acknowledged steer is taken
      // as applied at the first boundary after it was sent.
      const assumed = record.acknowledged
        ? record.chunksSinceSent >=
          (active === null ? 1 : APPLIED_FALLBACK_CHUNKS)
        : record.chunksSinceSent >= APPLIED_LAST_RESORT_CHUNKS;
      if (matches || assumed) appliedThrough = index;
    });
    sent.current.forEach((record, index) => {
      if (index <= appliedThrough) {
        markPromptApplied(record.prompt);
        confirmApplied(record.state);
      } else {
        remaining.push(record);
      }
    });
    sent.current = remaining;
  }, []);

  useReactorMessage((raw: unknown) => {
    const message = unwrapOrbisMessage(raw);
    if (message.type === "chunk_complete") {
      if (enabledRef.current) onChunk(message.active_prompt);
    } else if (message.type === "prompt_accepted") {
      const accepted = message.prompt?.trim();
      for (const record of sent.current) {
        if (!accepted || record.prompt === accepted) record.acknowledged = true;
      }
    }
  });

  // Dry run: there are no model events, so tick a simulated chunk clock.
  useEffect(() => {
    if (!enabled || !dryRun) return;
    const clock = setInterval(() => onChunk(null), CHUNK_MS);
    return () => clearInterval(clock);
  }, [dryRun, enabled, onChunk]);
}
