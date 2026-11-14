# Phase 4 — qa-reviewer evidence (third pass, steering rework)

Covers `6f9e625..40ad93e` plus my own test commits. Evidence only. No Reactor session was opened; none of the new wording or pacing has been seen on a stream. Times are PST from the machine clock.

## 1. Gates (3:47 PM, product code at `40ad93e`, clean working tree)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | exit 0, no errors |
| `pnpm build` | exit 0; 13 static pages, same routes as before, and the build now lists `ƒ Proxy (Middleware)`. `next-env.d.ts` restored afterwards |
| `pnpm test` | 9 files, 424 tests: 422 passed, 2 failed (S-1 and C-1 below, both new tests of mine) |
| `GET /`, `GET /starter` | 200 |

Before my additions the suite was 362 of 362.

## 2. Tests added

| File | Commit | Tests | Result |
| --- | --- | --- | --- |
| `tests/motion-prompt.test.ts` | `aa162d5` | 21 | all pass |
| `tests/proxy.test.ts` | `aa162d5` | 33 | all pass |
| `tests/steer-pacer.test.ts` (2 cases added; I own the file from here) | `e3ad4c5` | 11 | 1 fails (S-1) |
| `tests/demo-code.test.ts` | `e80f2a9` | 6 | 1 fails (C-1) |

`compileMotionPrompt` and `describeMotion`, verified against the change note:

- Exactly one motion sentence first for all 93 control combinations (81 flight, 12 tour), all 93 distinct, deterministic, inputs not mutated.
- The motion sentence has no negation, no preset place name and no weather or light word. "ground" and "horizon" appear and I treated them as camera references.
- Every control of `next.mode` is carried; the other mode's controls never change the text.
- Without `prev`, or with a `prev` that has the same environment, nothing about weather or light is added, in all 24 environments.
- "The weather changes from … to …" appears only when the weather differs from `prev` (all 36 pairs); likewise "The time of day changes from … to …" (all 16 pairs). Different targets give different sentences.
- Longest prompt without an event, over all 576 environment transitions on the longest flight and tour motion sentences: 60 words or fewer (backend-dev measured 59).
- The event sentence is appended when `prev` is omitted or the event is new, comes after any environment sentence, is left out when `prev` already has it, returns for a new id, and an over-long one is cut to under 40 words.
- `describeMotion` gives 93 distinct labels and ignores the environment and the other mode.

`proxy.ts`: with `DEMO_ACCESS_CODE` unset or blank every request passes; when set, a missing header or any of six wrong codes answers 401 JSON `{ error }` with `no-store`, and the right code passes (surrounding spaces ignored). The matcher is exactly `/api/sim/:path*`: it matches the four sim routes and does not match `/`, `/starter`, `/api/token`, the session routes, `/api/nano-banana`, `/api/orbis-prompt`, static files or `/api/simulate`.

## 3. Dry-run checks (`/?dry=1`, Paris, one tab, closed afterwards)

Guide replies were stubbed in that tab with a chosen delay; prompt entries and `speechSynthesis` calls were timestamped in milliseconds.

| Check | Observed | Verdict |
| --- | --- | --- |
| A, W, R together | One prompt, 110 ms after the keys: "…fast push forward, panning slowly left with the horizon level, rising steadily…". No second prompt in the next 13 s | Pass |
| Held W | 13 s later the state is still pitch climb, altitude mid; no system line; no extra prompt | Pass |
| Chip click then a key | Storm chip then D at once: focus on the page, HUD "Turning right", and both changes left as one prompt carrying the weather sentence | Pass |
| Changes right after a send | S, then A and F one second later: A and F left as one prompt 1907 ms after the previous one. Smallest gap across all 11 prompts of the run: 1907 ms | Pass |
| No transform on the video | `.video-layer` and everything inside it: no inline or computed transform at any point (sampled every 250 ms and on every DOM change) | Pass |
| Landing descent (L-1) | L while banked left: one prompt 170 ms later, "…heading straight, descending steadily…", touchdown about 4 s after it | Fixed |
| Weather after landing | First tour prompt: "The eye-level POV camera stands still, level and facing straight ahead. The weather changes from clear skies to a heavy thunderstorm…" | Pass |
| Guide L-2 | Reply delayed 9 s; request made on foot at 134.3 s, T at 136.5 s, reply at 143.3 s in flight: not captioned, logged or spoken | Fixed |
| Guide L-3 | Six lines in the run, gaps 21.0, 9.0, 11.1, 35.0 and 25.8 s; every `speak` call found nothing already speaking; never more than one request in flight | Fixed |
| Event twice | Second Fireworks press sent nothing | **Fails, S-1** |
| No session | No request to any Reactor host; no console errors | Pass |

"A weather change followed at once by a turn keeps the weather sentence until confirmed" cannot be seen in a dry run: the simulated chunk timer (1.83 s) always confirms before the 1.9 s pacing lets the next prompt out. It is covered on fake timers in `tests/steer-pacer.test.ts` (frontend-dev's case and my four-prompt case): an unconfirmed weather change is carried by every replacement, and dropped after confirmation.

## 4. Defects

### S-1 (frontend-dev, `hooks/steer-pacer.ts:117`, with `lastPrompt` in `hooks/use-steer-scheduler.ts:55-62`): the same event pressed twice in a row is not sent the second time

- Input: Fireworks; wait until it is applied and the chip clears; change nothing else; Fireworks again.
- Observed in the dry run: the first press sent a prompt and was confirmed. The second press logged "Button · Fireworks" and "event Fireworks" but no prompt; the chip stayed lit and the HUD kept showing the event. Twenty seconds later an unrelated S press sent "…descending steadily as the ground comes closer. Fireworks burst in bright colors…", so the stale event rode along with the next steer.
- Same result on fake timers: `tests/steer-pacer.test.ts` "fires the same event again…" expects 2 sends and gets 1.
- Cause: the second prompt is word for word the first (same motion, same event sentence), so `prompt === lastPrompt` drops it after `markStateSent()` has already marked the state as sent. Nothing is on the wire, so nothing confirms it and the event is never retired.
- Expected: a newly pressed event is always sent. The demo's situation buttons are the obvious way to hit this.

### C-1 (frontend-dev, `lib/orbis.ts:97-107` and `:132`): two requests that hit 401 together can prompt twice

- Input (`tests/demo-code.test.ts`, last case): two requests with no stored code; the second 401 is handled after the first prompt was answered but before the first retry has returned.
- Observed: `window.prompt` is called twice. Expected: once.
- Cause: `window.prompt` blocks, and `codePrompt` is cleared as soon as it resolves, so the "shared prompt" is never there for a second caller; the `latest !== stored` check only helps once the first retry has finished and stored the code.
- Reach: low. On a gated deployment the first gated call is normally the token request alone, and its code is stored before the guide or command box start. It needs two gated calls in flight with nothing stored, for example a `?dry=1` deck on the gated site, or a code changed mid-session.

No other defect found in `6b79926`, `bbf184e`, `bc33334`, `480c1c0` or `729fabc`.

## 5. Risks checked by reading

- **A sentence repeating forever.** Bounded while `chunk_complete` events arrive: a sent prompt is confirmed when `active_prompt` equals it, otherwise after 3 chunks if acknowledged, otherwise after 5 (`hooks/use-steer-scheduler.ts:143-147`). There is no time-based fallback, so if chunk events stop, an unconfirmed weather, light or event sentence is restated in every later prompt. If `active_prompt` never matches the sent text exactly, each event or weather sentence can ride in up to three consecutive prompts (about 5.5 s) before the fallback confirms it.
- **`fetchWithDemoCode` looping.** No loop: at most two requests per call (tested). A wrong code is not stored. After a dismissed prompt no further prompt appears in that page load, so the visitor must reload to try again; calls keep failing with 401 meanwhile.
- **FormData on the retry.** The same `FormData` is passed to both `fetch` calls and is read again intact (tested with a 2 KB image and a field).
- **`set_resolution` and `start`.** No race: `set_resolution` is awaited before `set_prompt` and `start` (`hooks/use-orbis-session.ts:321-329`). It is sent only when a `state` message has listed the tier. A refusal would not stop the launch, but it would show as an error banner, because only `set_audio_prompt` errors are exempt from the error display. The run-limit restart sends `start` alone and relies on the tier persisting.

## 6. Commit review, `6f9e625..40ad93e`

12 commits. Every subject matches the playbook format; no secret patterns; no `.env*` or `.vercel` files. Paths are in lane; `tests/steer-pacer.test.ts` was rewritten by frontend-dev in `bc33334` at the architect's request and is mine again from `e3ad4c5`.

## 7. Not run

- Any live Reactor session; anything on the Vercel deployment.
- The gate end to end: `DEMO_ACCESS_CODE` is not set locally, so the proxy and the client retry were tested in isolation, not together through a browser.
- Voice and the microphone hold on the guide (no microphone in the automation browser).
- `set_resolution`, the run-limit restart, the upload flow in a browser.
- The kickoff route on the regenerated Venice Beach aerial (to save a Gemini call).

## 8. Not verified until Winston's re-fly

- Whether one whole-motion sentence steers better: whether "panning slowly left" turns the view, whether three clauses in one sentence blur, whether "slowly" is too weak, and whether a held climb keeps climbing.
- Whether one prompt per 1.9 s feels calmer, and whether removing the CSS motion removes the nausea.
- Whether `active_prompt` equals the sent text, so confirmation is prompt and events are not repeated.
- Whether "The weather changes from … to …" and the time-of-day sentence land when sent once, and whether they survive a quick follow-up steer.
- 1080p delivery.
- Landing, tour, takeoff and upload on a live stream (unchanged from `phase-2-qa.md` section 8).
- The gated Vercel site: first visit prompt, stored code reuse, and the sim routes answering 401 without it.
