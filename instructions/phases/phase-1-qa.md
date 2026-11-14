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

## 6. Store tests (`tests/sim-store.test.ts`, commit `65178c2`)

12 tests, all pass, against `lib/sim/store.ts` at `2ad9bd6`. They run the scheduler loop as section 3.4 specifies it (send `compileSteerSteps(lastSent, state)[0]`, `advanceLastSent(step.delta)`, `clearEvent()` after an event) directly on the zustand store without React. Verified: the queue drains one change per chunk and converges; an event goes first and is cleared from both states; the same event can be triggered again after it was sent; a control toggled away and back sends nothing; a change made mid-drain is still sent.

This is the specified loop, not `hooks/use-steer-scheduler.ts` itself. The hook's timing (chunk events, debounce fallback, cleanup) is covered by code review only.

## 7. Destination tests (`tests/destinations.test.ts`, commit `bb1c4fc`)

129 tests, all pass, against `lib/sim/destinations.ts` at `7b584d5` and the image files on disk at 2:30 PM.

- Exactly the six ids, unique ids and names, kebab-case ids.
- Every string field non-empty; 5 guide facts each (contract asks for 3 to 6).
- All 12 image paths are `/destinations/<id>/<view>.png`, each file exists under `public/`, each is 1344x756 (exact 16:9).
- Kickoff prompts are 100 words or fewer and all distinct.
- Every destination has an `audioPrompt`, and it is not equal to, contained in, or containing either visual prompt.
- The dev server serves all 12 image URLs with 200 and `image/png`.

Note for Gate 1, not a defect: three seed files are about four times the size of the rest (`paris/ground.png` 2.6 MB, `tokyo/ground.png` 2.7 MB, `boston/aerial.png` 2.5 MB; the others are 0.5 to 0.8 MB). Reactor's upload size limit is undocumented (master doc section 2), and the upload sits inside the "video within about 10 s" budget. Boston's flight start is the one to time.

## 8. Phase 0 review (architect commits `d7252e1`, `b65fe41`)

`d7252e1` (`lib/sim/types.ts`): no defect found. The compiler, store and manifest all type-check against it.

`b65fe41`:

- **P0-1, architect, `app/api/token/route.ts:66-71` with `lib/orbis.ts:108`.** The route forwards Reactor's own status code, and the client treats any 401 as "demo code required". Checked: `POST https://api.reactor.inc/tokens` with an invalid key returns 401. So with a wrong or revoked `REACTOR_API_KEY` and no `DEMO_ACCESS_CODE`, pressing connect opens a "Enter the demo access code" prompt; cancelling it reports "A demo access code is required." and the real cause (bad Reactor key) is never shown. Expected: an upstream auth failure is reported as a server error (502), and only the route's own gate answers 401. Low severity locally (the key works: token route returned 200), more likely to bite on the Vercel deployment if the env var is mistyped.
- **P0-2, architect, running dev server versus `scripts/dev-with-session-cleanup.mjs:14-17,52`.** The dev wrapper process on this machine started at 1:07:52 PM, before `b65fe41` (2:21:48 PM), so the process in memory still has the old check `session.model === "reactor/visko-orbis-stable"`. The hot-reloaded registry route now records Dynamic sessions with `model: "reactor/visko-orbis-dynamic"`. If the dev server is stopped with Ctrl+C while a Dynamic session is still registered, the old `readRegistry` throws "session registry has an invalid format" and the shutdown sweep deletes nothing; that session keeps billing until the 900 s cap or the next `pnpm dev` startup sweep. Normal disconnects and tab closes are unaffected (they clean up through the routes). Fix is operational: one dev-server restart by Winston before Gate 1 loads the new script. Not verified live (no session opened).
- Hygiene: `b65fe41` also edits `app/api/session-registry/route.ts`, `scripts/dev-with-session-cleanup.mjs` (backend-dev paths) and `lib/orbis.ts` (frontend-dev path). It landed before the agents were launched, so nothing collided.
- `components/orbis-player.tsx:27` still says "Connect to Orbis Stable" on `/starter` while the default model is Dynamic. Wording only.

## 9. Commit review since `0dc4cb6`

Checked for each commit: subject format, single concern, owned paths, secrets, `.env*`, `.reactor-dev-sessions.json`.

| Commit | Author lane | Paths | Result |
| --- | --- | --- | --- |
| `913f7aa` docs/phase-0 | architect | `instructions/**` | clean |
| `7f51c2d` feat/starter-route | frontend-dev | `app/page.tsx`, `app/starter/page.tsx`, `app/styles.css` | clean |
| `47c4558` feat/prompt-compiler | backend-dev | `lib/sim/prompt-compiler.ts` | clean; one low-severity test failure (section 3) |
| `2ad9bd6` feat/sim-store | frontend-dev | `lib/sim/store.ts` | clean |
| `2e0adbd`, `9ead438` docs | frontend-dev, backend-dev | own phase notes | clean |
| `2a2d4ec` feat/destination-gallery | frontend-dev | `app/layout.tsx`, `app/page.tsx`, `app/styles.css`, `components/**` | clean. It imports `@/lib/sim/destinations`, which was committed 23 s later in `7b584d5`; the commit body says so |
| `7b584d5` feat/destinations | backend-dev | `lib/sim/destinations.ts` | clean |

No secrets, `.env*` files or `.reactor-dev-sessions.json` in any commit; `git ls-files` shows only `.env.example`.

Further sections are appended below as commits land.
