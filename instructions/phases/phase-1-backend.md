# Phase 1 — backend-dev handoffs

### 2:27 PM PST — Prompt compiler (`lib/sim/prompt-compiler.ts`)
- Commits: 47c4558 feat/prompt-compiler: add state-to-prompt compiler with steer queue
- State: pushed
- Exports (exact names):
  - `INITIAL_STATE: SimState` — flight mode, bank level, pitch level, speed cruise, altitude mid; tour stand/none/ahead; day/clear; event null.
  - `applyDelta(state, delta): SimState` — immutable; unknown keys and invalid enum values are ignored; `mode` is carried over (a delta has no mode).
  - `compileKickoff(placeName, state): string`
  - `compileSteer(prev, next): string | null`
  - `compileSteerQueue(prev, next): string[]` — priority: event, then controls of `next.mode` (flight: bank, pitch, altitude, speed; tour: move, turn, gaze), then environment (weather, timeOfDay).
  - Extras beyond the brief: `compileSteerSteps(prev, next): SteerStep[]` where `SteerStep = { prompt, delta }` (the single-field delta each sentence covers, so the scheduler can do `lastSent = applyDelta(lastSent, steps[0].delta)`); `sanitizeDelta(raw: unknown): SimStateDelta`; `FLIGHT_VALUES`, `TOUR_VALUES`, `ENVIRONMENT_VALUES`; `MAX_STEER_WORDS`.
- Verified:
  - `pnpm typecheck` — exit 0, no output.
  - Ad hoc Node script (not committed; `node --experimental-strip-types` importing the module) — "ALL CHECKS PASSED". It covered every single-field transition in both modes (including every return to neutral): exactly one sentence when the field is relevant to `next.mode`, zero when it belongs to the other mode; every sentence under 40 words (longest is 22) and free of negation words (no, not, never, without, none, nothing, stop, n't); `compileSteer` equals `queue[0]`; equal states give `null` and `[]`; a five-change state yields event, bank, speed, weather, time in that order; stepping with `compileSteerSteps` + `applyDelta` converges in five steps; `applyDelta` drops invalid enum values, unknown keys and malformed events, does not mutate its input, clears the event on `event: null` and keeps it when the key is omitted.
- Not verified: no vitest suite was run (qa-reviewer owns `pnpm test`). No prompt has been sent to Orbis, so how the stream responds to these sentences is untested; that is Winston's Gate 1 check.
- Mocked or stubbed: none
- Needs from others: frontend-dev should delete any local compiler stub and import from `@/lib/sim/prompt-compiler`. qa-reviewer: unit tests welcome.
- Notes:
  - An event produces a sentence only when `next.event` is non-null and differs from `prev.event` by `id` or `prompt`. Clearing an event produces no sentence.
  - A mode change alone produces no steer; landing is a reset plus a new kickoff.
  - The event prompt is sent as given (whitespace collapsed, cut at 40 words). The compiler does not check it for negation or place names; `/api/sim/command` is responsible for that.
- Next: destinations manifest and seed images.
