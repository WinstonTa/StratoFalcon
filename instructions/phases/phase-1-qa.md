# Phase 1 — qa-reviewer evidence

Evidence only. Nothing here says Gate 1 passed; the live stream check is Winston's.
Times are PST from the machine clock.

## 1. Baseline (tree at `0dc4cb6` plus frontend-dev's uncommitted starter move)

| Command | When | Result |
| --- | --- | --- |
| `pnpm typecheck` | 2:24 PM | exit 0, no errors |
| `pnpm build` | 2:24 PM | exit 0. Compiled in 2.6 s, TypeScript pass, 8 static pages. Routes: `/`, `/_not-found`, `/api/nano-banana`, `/api/orbis-prompt`, `/api/session-cleanup`, `/api/session-registry`, `/api/token` |

- `pnpm build` runs alongside Winston's dev server without touching it (`next dev` writes to `.next/dev`, `next build` to `.next`). `/` and `/starter` still answered 200 afterwards.
- Side effect to know about: `next build` rewrites the tracked file `next-env.d.ts` (its imports switch from `./.next/dev/types/...` to `./.next/types/...`). I restore it with `git checkout -- next-env.d.ts` after every build so nobody commits it by accident.

## 2. Test harness

- `vitest.config.ts` (commit `1399964`): node environment, `tests/**/*.test.ts`, `@/` alias to the repo root as in `tsconfig.json`.
- Vitest prints a warning that the config is "ESM syntax in a file loaded as CommonJS". It is harmless today; it goes away if `package.json` gets `"type": "module"` (architect's file) or the config is renamed `.mts`.

## 3. Prompt-compiler tests (`tests/prompt-compiler.test.ts`, commit `ea27d25`)

Run against `lib/sim/prompt-compiler.ts` at `47c4558`: **187 tests, 186 passed, 1 failed.**

Covered: `INITIAL_STATE`; equal states; all 92 single-field transitions relevant to the mode (flight and tour, every from/to pair, so every return to neutral); 30 transitions of the other mode's controls are ignored; event handling; queue priority in both modes; `applyDelta` immutability, unknown keys, invalid enum values, malformed groups and events; `compileKickoff` in every environment combination.

Readings I tested where the spec is open:

- "under 40 words" means strictly fewer than 40.
- `compileSteer(prev, next)` equals `compileSteerQueue(prev, next)[0]`.
- "does not contain the place name" is checked against the six preset names, since `compileSteer` is not given a place name.
- `mode` is not part of a delta, so `applyDelta` ignores it.
- Clearing an event (`next.event === null`) produces no sentence.

### Failing test

- **backend-dev, `lib/sim/prompt-compiler.ts:70-74` (`limitWords`) used at `:286`.** Input: `compileSteerQueue(INITIAL_STATE, { ...INITIAL_STATE, event: { id: "long", label: "Long", prompt: "word0 word1 … word59." } })` (60 words). Observed: one steer of exactly 40 words. Expected by the rule "under 40 words per steer": 39 or fewer. Low severity: only an event prompt of 40 or more words reaches the limit; every built-in sentence is 22 words or fewer.

## 4. Smoke checks against the dev server (2:28 PM)

| Request | Result |
| --- | --- |
| `GET /` | 200, no server-error markers in the HTML |
| `GET /starter` | 200, no server-error markers in the HTML |
| `POST /api/token` (no `x-demo-code`; `DEMO_ACCESS_CODE` is not set locally) | 200, `application/json`, body has exactly one key, `jwt`, a three-segment token. `Cache-Control: no-store, max-age=0`. The token's `authorization_details` claim lists both Orbis models with `max_sessions: 1` and `max_session_duration_seconds: 900`. The token itself was not printed or stored. |
| `GET /api/token` | 405 |

No Reactor session was opened.

## 5. Not run

- Any live Reactor session, `set_prompt`, video or audio. Everything past the Reactor boundary is unverified.
- The `DEMO_ACCESS_CODE` gate (the variable is not set locally and the dev server cannot be restarted by agents).

Further sections are appended below as commits land.
