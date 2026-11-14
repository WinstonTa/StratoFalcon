"use client";

import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef } from "react";

import { CHUNK_MS, SteerPacer, type SteerTrigger } from "@/hooks/steer-pacer";
import { unwrapOrbisMessage } from "@/lib/orbis";
import { compileSteerSteps } from "@/lib/sim/prompt-compiler";
import { useSimStore } from "@/lib/sim/store";

/** Wait this long after an input before the fallback looks at the queue. */
const DEBOUNCE_MS = 250;
/** How often the fallback re-checks while the chunk clock is silent. */
const WATCHDOG_MS = 500;
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
 * On every `chunk_complete` this takes the FIRST pending change between
 * `lastSentState` and `state`, sends that single sentence with `set_prompt`,
 * and advances `lastSentState` by only that change. The rest wait for the next
 * boundary. A timer fallback covers a silent chunk clock; the pacing rules live
 * in hooks/steer-pacer.ts.
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
  const pacer = useRef<SteerPacer | null>(null);
  pacer.current ??= new SteerPacer(Date.now());
  const sent = useRef<SentSteer[]>([]);

  const maybeSend = useCallback(
    (trigger: SteerTrigger) => {
      if (!enabledRef.current || !pacer.current) return;

      const store = useSimStore.getState();
      const [step] = compileSteerSteps(store.lastSentState, store.state);
      if (!step) return;

      const now = Date.now();
      if (!pacer.current.canSend(trigger, now)) return;
      pacer.current.noteSend(now);

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
    },
    [dryRun, sendCommand],
  );

  /** A chunk boundary: settle applied markers, then send the next steer. */
  const onChunk = useCallback(
    (activePrompt: string | null | undefined) => {
      pacer.current?.noteChunk(Date.now());
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

      maybeSend("chunk");
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

  // Fallback for a silent chunk clock. The pacer refuses it while chunk
  // boundaries are arriving, so this never adds a second steer to a chunk.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useSimStore.subscribe((next, previous) => {
      if (next.state === previous.state) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => maybeSend("fallback"), DEBOUNCE_MS);
    });
    const watchdog = setInterval(() => maybeSend("fallback"), WATCHDOG_MS);
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

  // Each enabled stretch starts with a clean slate.
  useEffect(() => {
    pacer.current?.reset(Date.now());
    if (!enabled) sent.current = [];
  }, [enabled]);
}
