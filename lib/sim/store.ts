"use client";

import { create } from "zustand";

import {
  applyDelta as applyStateDelta,
  INITIAL_STATE,
} from "@/lib/sim/prompt-compiler";
import type {
  Destination,
  SimMode,
  SimPhase,
  SimState,
  SimStateDelta,
} from "@/lib/sim/types";

export type MissionLogKind =
  | "input"
  | "gemini"
  | "state"
  | "prompt"
  | "guide"
  | "system";

export type MissionLogStatus = "pending" | "applied";

export interface MissionLogEntry {
  id: number;
  /** Epoch milliseconds. */
  time: number;
  kind: MissionLogKind;
  text: string;
  /** Only prompt entries carry a status. */
  status?: MissionLogStatus;
}

const MAX_LOG_ENTRIES = 200;

let nextLogId = 1;

function makeEntry(
  kind: MissionLogKind,
  text: string,
  status?: MissionLogStatus,
): MissionLogEntry {
  return { id: nextLogId++, time: Date.now(), kind, text, status };
}

function appendEntries(log: MissionLogEntry[], entries: MissionLogEntry[]) {
  return [...log, ...entries].slice(-MAX_LOG_ENTRIES);
}

function freshState(): SimState {
  return applyStateDelta(INITIAL_STATE, {});
}

/** Human-readable list of the fields that differ, e.g. "bank level → left". */
export function describeStateChange(prev: SimState, next: SimState): string[] {
  const changes: string[] = [];
  const groups = [
    [prev.flight, next.flight],
    [prev.tour, next.tour],
    [prev.environment, next.environment],
  ] as const;
  for (const [before, after] of groups) {
    const a = before as unknown as Record<string, string>;
    const b = after as unknown as Record<string, string>;
    for (const key of Object.keys(b)) {
      if (a[key] !== b[key]) changes.push(`${key} ${a[key]} → ${b[key]}`);
    }
  }
  if (next.event && next.event.id !== prev.event?.id) {
    changes.push(`event ${next.event.label}`);
  }
  return changes;
}

export function statesEqual(a: SimState, b: SimState): boolean {
  return (
    a.mode === b.mode &&
    describeStateChange(a, b).length === 0 &&
    (a.event?.id ?? null) === (b.event?.id ?? null) &&
    (a.event?.prompt ?? null) === (b.event?.prompt ?? null)
  );
}

interface SimStore {
  phase: SimPhase;
  destination: Destination | null;
  state: SimState;
  /** The state Orbis has been told about so far (kickoff plus sent steers). */
  lastSentState: SimState;
  missionLog: MissionLogEntry[];
  guideLines: string[];

  /** Choose a destination and arm a new flight. Clears the previous log. */
  beginFlight: (destination: Destination) => void;
  /** Merge a delta into `state` and log the resulting change. Synchronous. */
  applyDelta: (delta: SimStateDelta) => void;
  /** Record that a steer covering `delta` was sent to Orbis. */
  advanceLastSent: (delta: SimStateDelta) => void;
  /** Drop the one-shot event from `state` once its sentence has been sent. */
  clearEvent: () => void;
  setPhase: (phase: SimPhase) => void;
  /**
   * Switch between flight and tour after a landing or takeoff. Controls return
   * to neutral; the environment is kept in `state` but `lastSentState` goes
   * back to the seed's baseline, so the scheduler re-applies weather and time
   * of day to the new view.
   */
  enterMode: (mode: SimMode) => void;
  /**
   * The stream was restarted from its kickoff prompt: Orbis only knows the
   * baseline again, so everything in `state` becomes pending.
   */
  resyncLastSent: () => void;
  /** Patch the active destination, e.g. when an upload's ground seed is ready. */
  updateDestination: (id: string, patch: Partial<Destination>) => void;
  /** Append a mission log entry and return its id. */
  log: (kind: MissionLogKind, text: string, status?: MissionLogStatus) => number;
  /**
   * Mark prompt entries as applied. With `prompt`, marks the newest pending
   * entry with that exact text and every pending entry before it (a newer
   * prompt supersedes older ones). Without it, marks every pending entry.
   */
  markPromptApplied: (prompt?: string) => void;
  addGuideLine: (line: string) => void;
  /** Back to the gallery: idle phase, no destination, pristine state. */
  reset: () => void;
}

export const useSimStore = create<SimStore>((set, get) => ({
  phase: "idle",
  destination: null,
  state: freshState(),
  lastSentState: freshState(),
  missionLog: [],
  guideLines: [],

  beginFlight: (destination) =>
    set({
      phase: "preparing",
      destination,
      state: freshState(),
      lastSentState: freshState(),
      guideLines: [],
      missionLog: [
        makeEntry("system", `Destination selected: ${destination.name}`),
      ],
    }),

  applyDelta: (delta) => {
    const { state, missionLog } = get();
    const next = applyStateDelta(state, delta);
    const changes = describeStateChange(state, next);
    if (!changes.length) return;
    set({
      state: next,
      missionLog: appendEntries(missionLog, [
        makeEntry("state", changes.join(" · ")),
      ]),
    });
  },

  advanceLastSent: (delta) =>
    set((store) => ({
      lastSentState: applyStateDelta(store.lastSentState, delta),
    })),

  clearEvent: () =>
    set((store) => ({
      state: applyStateDelta(store.state, { event: null }),
      lastSentState: applyStateDelta(store.lastSentState, { event: null }),
    })),

  setPhase: (phase) => set({ phase }),

  enterMode: (mode) =>
    set((store) => {
      const base = freshState();
      return {
        state: {
          mode,
          flight: base.flight,
          tour: base.tour,
          environment: { ...store.state.environment },
          event: null,
        },
        lastSentState: { ...base, mode },
      };
    }),

  resyncLastSent: () =>
    set((store) => ({
      lastSentState: { ...freshState(), mode: store.state.mode },
    })),

  updateDestination: (id, patch) =>
    set((store) =>
      store.destination?.id === id
        ? { destination: { ...store.destination, ...patch } }
        : store,
    ),

  log: (kind, text, status) => {
    const entry = makeEntry(kind, text, status);
    set((store) => ({ missionLog: appendEntries(store.missionLog, [entry]) }));
    return entry.id;
  },

  markPromptApplied: (prompt) =>
    set((store) => {
      let cutoff = Number.POSITIVE_INFINITY;
      if (prompt !== undefined) {
        const match = [...store.missionLog]
          .reverse()
          .find(
            (entry) =>
              entry.kind === "prompt" &&
              entry.status === "pending" &&
              entry.text === prompt,
          );
        if (!match) return store;
        cutoff = match.id;
      }
      let changed = false;
      const missionLog = store.missionLog.map((entry) => {
        if (
          entry.kind === "prompt" &&
          entry.status === "pending" &&
          entry.id <= cutoff
        ) {
          changed = true;
          return { ...entry, status: "applied" as const };
        }
        return entry;
      });
      return changed ? { missionLog } : store;
    }),

  addGuideLine: (line) =>
    set((store) => ({ guideLines: [line, ...store.guideLines].slice(0, 20) })),

  reset: () =>
    set({
      phase: "idle",
      destination: null,
      state: freshState(),
      lastSentState: freshState(),
      missionLog: [],
      guideLines: [],
    }),
}));
