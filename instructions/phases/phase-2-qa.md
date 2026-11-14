# Phases 2 and 3 — qa-reviewer evidence (second pass)

Covers everything pushed after `9c46fac`, up to `5d96d3e`. Evidence only: nothing here says Gate 2 or Gate 3 passed. No Reactor session was opened. Times are PST from the machine clock.

## 1. Status of the Phase 1 defects

| Defect | Fix | Result |
| --- | --- | --- |
| B-1 over-long event prompt gave a 40-word steer | `843d249` (`MAX_STEER_WORDS = 39`) | Fixed. The failing test now passes |
| P0-1 upstream Reactor 401 shown as a demo-code prompt | `3b697fc` | Fixed. Read `app/api/token/route.ts:66-73` (always 502) and covered by `tests/token-route.test.ts` with Reactor stubbed: upstream 401, 403, 429 and 500 all answer 502; no real key or dev server involved |
| P0-2 dev wrapper older than `b65fe41` | dev-server restart | Cleared. The wrapper process now running started at 2:51:23 PM |
| F-1 two steers 0.4 s apart | `90a2699` (`hooks/steer-pacer.ts`) | Fixed. Reproduced my A, W, R input in a dry run, section 4 |
| F-2 dry-run flag false on a remount | `20c7800` | Fixed by reading: `FlightDeck` now gets `readDryRunFlag()` synchronously on every render (`components/stratofalcon-app.tsx:14-17,39`). Not reproduced, since the failing case would open a session |

## 2. Tests

`pnpm test` at 2:50 PM, before my additions: 5 files, 341 tests, all passed (B-1 included).

Added `tests/token-route.test.ts` (commit `dc2c988`), 16 tests: the token route with `fetch` and the environment stubbed. Besides P0-1 it covers the `DEMO_ACCESS_CODE` gate, which could not be exercised against the dev server: no code or a wrong code answers 401 without calling Reactor, the right code issues a token, and the request to Reactor lists both Orbis models, one session and a 900 s cap.

`tests/steer-pacer.test.ts` was added by frontend-dev in `90a2699`. `tests/**` is my path; the file says it was added at the architect's request. Its 4 tests pass and I have kept it.

## 3. Backend review and route smoke (`843d249`, `f30a038`, `ac43f0f`, `8719962`, `b134596`)

No contract drift: request and response shapes match `lib/sim/types.ts` and master doc section 3.3 for all four sim routes. All are `runtime = "nodejs"`, answer `{ error }` with a non-2xx status, and send `Cache-Control: no-store`.

Smoke against `http://localhost:3000` (three Gemini calls that succeed, one that fails fast):

| Route | Request | Status | Latency | Result |
| --- | --- | --- | --- | --- |
| guide | Paris, 2 facts, flight, sunset, 1 recent line | 200 | 0.85 s | `{ line }`, 21 words, used the 1889 fact, did not repeat the recent line |
| guide | not JSON; no `destinationName`; `guideFacts` a string or missing; `recent: [1,2]`; no `state` | 400 each | | `{ error }` naming the field |
| guide | GET | 405 | | |
| kickoff | `venice-beach/aerial.png` (2.4 MB PNG), `mode=flight` | 200 | 4.08 s | `{ name, prompt, guideFacts }`; prompt 54 words, starts "A first-person aerial view from an aircraft flying forward over"; 4 facts |
| kickoff | JSON body; no image; `mode=swim`; `text/plain` file | 400 each | | `{ error }` |
| kickoff | 10 MB + 1 byte file | 413 | 0.04 s | `{"error":"The image must be 10 MB or smaller"}` |
| kickoff | text bytes declared as `image/png` | 502 | 0.63 s | `{"error":"Gemini could not read the image"}` |
| seed | `venice-beach/aerial.png`, `view=ground`, hint "Venice Beach, California" | 200 | 9.30 s | `image/png`, 2.09 MB, 1344x756 (exact 16:9), truecolour; `X-Seed-Exact-16-9: 1`; `Server-Timing: nano-banana;dur=9124`. I viewed it: an eye-level boardwalk with palms, shopfronts, sand and the pier in the distance |
| seed | `view=sideways`; no image | 400 each | | `{ error }` |

Vercel, by reading (nothing was deployed):

- `lib/server/sixteen-nine.ts:30-47` loads `sharp` through a computed `createRequire` name, so Next's file tracing will not include it in the function. On Vercel the load is expected to fail and the route then returns the model's 1344x768 frame with `X-Seed-Exact-16-9: 0`. No visible effect in the app: the only caller crops the result to 1280x720 in the browser (`components/destination-gallery.tsx`, `prepareGroundView`). The no-sharp path itself was not run.
- Vercel caps a function's request body at about 4.5 MB, below the routes' 10 MB limit. The app never sends more than a 1280x720 JPEG, so the UI path is unaffected; a direct caller sending 5 to 10 MB would get Vercel's own 413 rather than the route's JSON.
- `maxDuration` is 30 s on command and guide and 60 s on kickoff and seed; the longest internal deadlines are 10 s, 10 s, 30 s and 45 s, so each fits.
- `pnpm-lock.yaml` is lockfile version 9.0.

Findings:

- **D-1, architect, deployment.** `DEMO_ACCESS_CODE` protects only `/api/token`. `/api/sim/command`, `/api/sim/guide`, `/api/sim/kickoff` and `/api/sim/seed` accept any caller, so on a public URL anyone can spend the Gemini key; each seed call is one image generation of about 9 s. By reading; not exercised on a deployment.
- **Content note, backend-dev.** Gemini's kickoff route names the Venice Beach preset aerial "Manhattan Beach Pier, California" (the pier has a round building at its end). The demo is in Venice and opens with this preset.

## 4. Frontend review and dry-run checks (`90a2699`, `20c7800`, `c5dda21`, `a9bda80`, `46dc060`, `e4ae025`, `96e6eea`, `3043c73`, `76e87d1`)

Browser pane, `http://localhost:3000/?dry=1`, Paris, one tab, closed afterwards. To test failure and overlap without Gemini calls I wrapped `fetch` and `speechSynthesis` in that tab only: guide replies were stubbed with a chosen delay, one command request was made to fail after 6 s, and a `MutationObserver` recorded when each prompt entry appeared (millisecond clock).

| Check | Input | Observed | Verdict |
| --- | --- | --- | --- |
| F-1 pacing | A, W, R within about 0.2 s | Prompts at 11.090 s, 12.931 s, 14.753 s: gaps 1841 ms and 1822 ms. Across all 17 prompts of the run the smallest gap was 1724 ms | Fixed (at least 1.7 s) |
| Keys ignored in the command box | Focus the box, type `was d q l t v` | Box holds the text; HUD attitude, speed and mode unchanged; no log entry; mic did not start; no landing | Pass |
| Slow or failed command does not block | Submit with the request held 6 s then 502; press D and S meanwhile | Box cleared and blurred, status "Co-pilot thinking…", HUD went to "Bank right / Descending" at once; after 6 s the log shows "Co-pilot error: QA injected failure", status cleared, box usable | Pass |
| Same event twice | Fireworks, 5 s later Fireworks | Two "Fireworks burst…" prompts, at 67.8 s and 71.5 s | Pass |
| Guide requests never overlap | Guide replies delayed 26 s, across a 20 s interval tick, two event changes, a landing and a takeoff | 7 guide requests in the run, never more than 1 in flight | Pass |
| Landing (dry) | L while banked right | "Final approach", keys disabled, steers "rolls back to wings level" then "pitches down and descends", then tour mode with the ground image, tour keys and tour events | Pass, see L-1 |
| Tour keys | W, A, Q, then R | Walking, Turning left, Looking up; three prompts 1724 ms and 1827 ms apart; R ignored | Pass |
| Takeoff (dry) | T | Back to flight mode, controls neutral, flight keys | Pass |
| Speech cancelled on End flight | Long utterance speaking, click End flight | `speechSynthesis.cancel` called (count 10 to 13), `speaking` false, gallery shown, no further speak or guide call in the next 5 s | Pass |
| No session | Whole run | No request to any Reactor host; no console errors | Pass |

Low-severity findings:

- **L-1, frontend-dev, `components/flight-deck.tsx:175-202` (`land`, `DESCENT_MS`).** Input: press L while banked. Observed: the first chunk boundary carries "rolls back to wings level"; "pitches down and descends" leaves 1.8 s later and the view switch follows about 2.2 s after that, so the descent sentence gets about one chunk. Expected (master doc section 3.4): a descent steered for two chunks. With any other change still queued the descent may not be sent at all before the reset.
- **L-2, frontend-dev, `hooks/use-guide.ts:329-365`.** Input: guide reply delayed; request made on foot, T pressed before the reply. Observed: the line requested in tour mode was captioned, logged and spoken after takeoff. With the real 0.9 s latency the window is under a second.
- **L-3, frontend-dev, `hooks/use-guide.ts:367-398` and `:300-306`.** Observed guide lines at 21.4 s and 29.3 s, 7.9 s apart: the 20 s interval tick does not apply `MIN_GAP_MS`, and `speak()` cancels whatever is still being spoken. A 20-word line that takes longer than the gap is cut off by the next one.

Read but not exercised: the voice path (`useVoiceCommand`), the live landing and takeoff (`resetGeneration`, `transitionTo`), the run-limit restart (`restartRun`) and the upload flow. I found no defect by reading; the upload flow sends only the cropped 1280x720 JPEG to the routes.

## 5. Commit review, `9c46fac..5d96d3e`

22 commits. Every subject matches the playbook format. No secret patterns in any diff; no `.env*`, key files or `.reactor-dev-sessions.json`. Paths stay inside each author's lane, with the one agreed exception in section 2 (`tests/steer-pacer.test.ts`).

## 6. Final run (2:57 PM, HEAD `5d96d3e`, clean working tree)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | exit 0, no errors |
| `pnpm build` | exit 0, 13 static pages; adds `/api/sim/kickoff` and `/api/sim/seed` to the Phase 1 route list. `next-env.d.ts` restored afterwards |
| `pnpm test` | 6 files, 357 tests, all passed |
| `GET /`, `GET /starter` | 200, no server-error markers |
| `POST /api/token` | 200, `jwt` field present (not printed) |

## 7. Not run

- Any live Reactor session.
- Voice: the browser pane has no microphone input, so speech recognition, push-to-talk and the V key were only read.
- The upload flow in a browser (frontend-dev reports one dry run of it).
- The run-limit restart and the Retry button after a failed landing.
- The no-sharp path of the seed route, and anything on Vercel.
- JPEG and WebP uploads to kickoff and seed (PNG only).

## 8. Not verified before Gate 2 and Gate 3

Gate 2:

- A situation, weather or time-of-day sentence visibly changing the stream, and how long it takes.
- A typed command end to end on a live stream.
- Voice in Chrome with a real microphone, including whether the microphone picks up the guide's own spoken line while the viewer talks (nothing cancels guide speech when listening starts).
- The guide's voice and Orbis audio playing together; a real guide line being cut short by the next one (L-3).
- `set_audio_prompt` and the Mute button.

Gate 3:

- `reset`, `generation_reset`, the second `set_image` and `start`, and the overlay lifting on the new run's first frames.
- Whether the descent is visible before the switch (L-1).
- Weather and time of day being re-applied after landing (they are queued again by `enterMode`).
- Takeoff from the tour; the run-limit restart at about 7 minutes on Dynamic.
- An uploaded photo flown and landed: kickoff naming, the generated ground view (about 10 s) arriving while in flight, and Land unlocking.
- End flight during a landing or while connecting.

Carried over from Phase 1 and still open: everything in `phase-1-qa.md` section 15, including what the stream does when a second steer replaces the first.
