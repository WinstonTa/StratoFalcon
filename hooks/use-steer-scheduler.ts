"use client";

import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef } from "react";

import { unwrapOrbisMessage } from "@/lib/orbis";
import { compileSteerSteps } from "@/lib/sim/prompt-compiler";
import { useSimStore } from "@/lib/sim/store";

/** One Orbis chunk: 33 frames at 18 fps. Used only to pace the dry run. */
const CHUNK_MS = 1830;
/** Wait this long after an input before the fallback send. */
const DEBOUNCE_MS = 250;
/** No chunk_complete for this long means the chunk clock cannot be trusted. */
const STALL_MS = 4000;
/** If active_prompt never matches, treat an acknowledged steer as applied after this many chunks. */
const APPLIED_FALLBACK_CHUNKS = 3;

interface SentSteer {
  prompt: string;
  acknowledged: boolean;
  chunksSinceSent: number;
}

/**
 * Reconciles the model with the simulation state, one sentence at a time.
 *
 * Orbis picks up a new prompt at the next chunk boundary, so sending faster
 * than one steer per chunk only overwrites the previous one. On every
 * `chunk_complete` (and shortly after an input, if nothing has gone out since
 * the last boundary) this takes the FIRST pending change between
 * `lastSentState` and `state`, sends that single sentence with `set_prompt`,
 * and advances `lastSentState` by only that change. The rest wait their turn.
 *
 * `dryRun` paces itself with a timer and logs prompts without sending them.
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
  const sentThisChunk = useRef(false);
  const lastChunkAt = useRef(0);
  const lastSendAt = useRef(0);
  const sent = useRef<SentSteer[]>([]);

  const maybeSend = useCallback(() => {
    if (!enabledRef.current) return;

    const now = Date.now();
    if (sentThisChunk.current) {
      // At most one steer per chunk, unless the chunk clock has stalled.
      const stalled =
        !dryRun &&
        now - lastChunkAt.current > STALL_MS &&
        now - lastSendAt.current > STALL_MS / 2;
      if (!stalled) return;
    }

    const store = useSimStore.getState();
    const [step] = compileSteerSteps(store.lastSentState, store.state);
    if (!step) return;

    sentThisChunk.current = true;
    lastSendAt.current = now;
    const record: SentSteer = {
      prompt: step.prompt,
      acknowledged: dryRun,
      chunksSinceSent: 0,
    };
    sent.current.push(record);
    store.log("prompt", step.prompt, "pending");

    if (!dryRun) {
      // sendCommand never rejects; a refusal comes back as command_error.
      void sendCommand("set_prompt", { prompt: step.prompt }).then((raw) => {
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

    // Orbis has now been told about this one change, and only this one.
    store.advanceLastSent(step.delta);
    if (step.delta.event) store.clearEvent();
  }, [dryRun, sendCommand]);

  /** A chunk boundary: settle applied markers, then send the next steer. */
  const onChunk = useCallback(
    (activePrompt: string | null | undefined) => {
      lastChunkAt.current = Date.now();
      const { markPromptApplied } = useSimStore.getState();
      const active =
        typeof activePrompt === "string" ? activePrompt.trim() : null;

      const remaining: SentSteer[] = [];
      let appliedThrough = -1;
      sent.current.forEach((record, index) => {
        record.chunksSinceSent += 1;
        const matches = active !== null && record.prompt === active;
        // Stable does not report active_prompt: an acknowledged steer is
        // taken as applied at the first boundary after it was sent.
        const assumed =
          record.acknowledged &&
          (active === null
            ? record.chunksSinceSent >= 1
            : record.chunksSinceSent >= APPLIED_FALLBACK_CHUNKS);
        if (matches || assumed) appliedThrough = index;
      });
      sent.current.forEach((record, index) => {
        if (index <= appliedThrough) markPromptApplied(record.prompt);
        else remaining.push(record);
      });
      sent.current = remaining;

      sentThisChunk.current = false;
      maybeSend();
    },
    [maybeSend],
  );

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

  // Fallback after an input: do not wait for the next boundary if nothing has
  // been sent since the last one.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useSimStore.subscribe((next, previous) => {
      if (next.state === previous.state) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(maybeSend, DEBOUNCE_MS);
    });
    // Watchdog for a stalled chunk clock.
    const watchdog = setInterval(maybeSend, 1000);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      clearInterval(watchdog);
    };
  }, [enabled, maybeSend]);

  // Dry run: there are no model events, so tick a simulated chunk clock.
  useEffect(() => {
    if (!enabled || !dryRun) return;
    const clock = setInterval(() => onChunk(null), CHUNK_MS);
    return () => clearInterval(clock);
  }, [dryRun, enabled, onChunk]);

  // A new flight starts with a clean slate.
  useEffect(() => {
    if (enabled) {
      lastChunkAt.current = Date.now();
      return;
    }
    sent.current = [];
    sentThisChunk.current = false;
  }, [enabled]);
}
