# Change: steering rework after the first live flight

Written 3:35 PM PST by the architect. This changes section 3 of the master document: the "one single-action steer per chunk" scheduler is replaced.

## Gate result that triggered it

## Gate 1–2 (partial) — about 3:00 PM
- typecheck: pass
- build: pass (qa-reviewer, 2:57 PM)
- Unit tests: 357/357 (qa-reviewer, 2:57 PM)
- Live check by Winston: tried **flight and keyboard** and **situations and typed commands**. Both work. Not tried: voice, landing, tour, upload.
- Winston's words: "The steering kinda works. But it's super slow and nauseating, and it is obvious that it is poorly made AI. We're gonna have to strengthen the steering and the WASD controls."
- Decision: fix steering first; everything else waits.

## Diagnosis

Not proven on a live stream; these are the causes the evidence points to.

1. **Bursts of prompts.** The Orbis Dynamic prompt guide says a change needs 2–4 s to land and that "Sending a new action every 500 ms just queues competing morphs". Our first build could send two prompts 0.4 s apart (QA F-1, since fixed), and one `W` press produced three prompts in ten seconds through automatic altitude stepping.
2. **Controls dropped.** Each `set_prompt` replaces the active prompt. After "bank left" then "climb", the prompt held only the climb.
3. **Queue latency.** Three keys pressed together took three chunks (over 5 s) just to leave the browser.
4. **The video itself was being rolled and scaled in CSS** as instant feedback. That is a likely source of the nausea.

## What the docs say (docs.reactor.inc, read 3:10 PM)

- "do not restate the world. The model preserves what you do not change." Restating who or where "can read as a scene rebuild".
- Without an explicit change, "subjects, backgrounds, objects, and camera all stay as they were".
- One action per prompt; compound actions collapse "to a blurry morph".
- Change things explicitly: "The weather changes from sunny to rainy."
- Camera vocabulary: static, handheld, pan, tilt, zoom, POV; eye-level, high angle, low angle, overhead. Example: "Slow push forward at eye level as the camera closes in on the glass."
- No guidance exists for flying or first-person movement, and nothing compares Dynamic with Stable for motion.

## New design

- `compileMotionPrompt(next, prev?)` (backend-dev): always **one camera-motion sentence** for the whole current motion, written as a single slow camera move (push forward, pan, rise or descend). An explicit change sentence is appended only for weather or time of day that differs from `prev`, and an event sentence only when the event is new. Environment is sent once and not repeated, because the model preserves it.
- Scheduler (frontend-dev): last-write-wins, no queue. The first change after a quiet period goes out after about 150 ms; after any send, the next waits at least about 1.9 s and then sends the latest state once.
- The video element never moves. Instant feedback stays in the HUD only.
- Automatic altitude stepping is removed as a source of prompts.
- Delivery resolution is set to 1080p when offered (default was 2k).

## Also in this round

- QA findings L-1, L-2, L-3 (landing descent, guide timing) go to frontend-dev.
- QA finding D-1: `/api/sim/*` was open on a public deployment. `proxy.ts` gates it behind the same `x-demo-code` as the token route when `DEMO_ACCESS_CODE` is set. It is **not pushed yet**: it must land together with the client change that sends the header, or the live site's command box, guide and upload would start answering 401.
- Venice Beach aerial seed is being regenerated; the kickoff route identified the current one as Manhattan Beach Pier.

## Deployment

Winston has a live Vercel deployment and will test there. The Vercel account connected to this session shows only an unrelated project, so the architect cannot see the StratoFalcon project, its environment variables or its build status. Every push to `main` is assumed to trigger a production build, so nothing is pushed that does not typecheck.

## Unverified

Everything above is a design change. None of the new wording or pacing has been judged on a live stream. Winston's re-fly is the test.

## Result of the rework — 4:05 PM

- typecheck: pass
- build: pass
- Unit tests: 424/424 (architect, 4:02 PM, tree at `909e449`)
- Live check by Winston on the Vercel site, second re-fly (after `c22c12b`, before `77ff5d8`): directions inverted (asked for right, view turned left), turns and climbs barely showed, still too slow.
- Third round: turn wording v3 (`77ff5d8`, a turn names where the scenery slides), sharper climb and dive wording, send gap 1.9 s to 1.2 s and debounce 150 ms to 80 ms (`9346850`), Turn sense switch (`c0d823d`).
- Live check by Winston, third re-fly: **pressing D turns the view right** with Turn sense on Normal. He has not yet said whether turns and climbs are now strong enough or whether the response time is acceptable.
- Decision: Normal stays the default. Move on to the untested paths: voice, landing, tour, take-off, upload.

Deviation: the architect edited `lib/sim/prompt-compiler.ts` (backend-dev's path) and two expectations in `tests/motion-prompt.test.ts` (qa-reviewer's path) directly for the third round, to save a round trip. Both agents were idle at the time.
