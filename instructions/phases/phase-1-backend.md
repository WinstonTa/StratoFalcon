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

### 2:33 PM PST — Destinations manifest (`lib/sim/destinations.ts`)
- Commits: 7b584d5 feat/destinations: add the six preset destinations manifest; df52ce5 feat/destinations: align kickoff prompts with the final seed images
- State: pushed
- Exports (exact names): `DESTINATIONS: Destination[]` in this order: `paris`, `tokyo`, `los-angeles`, `new-york-city`, `boston`, `venice-beach`; `getDestination(id: string): Destination | undefined`.
- Image paths: `/destinations/<id>/aerial.png` and `/destinations/<id>/ground.png` (extension is **.png** for all twelve).
- Verified:
  - `pnpm typecheck` — exit 0.
  - Ad hoc Node script (not committed) — "DESTINATIONS OK": ids and order as above; every `aerialImage`/`groundImage` path resolves to an existing file under `public/` whose PNG header is exactly 16:9; every kickoff is 3 sentences, 60–78 words, with no negation words; 5 guideFacts and an audioPrompt per preset; `getDestination("nowhere")` is `undefined`.
  - Kickoff text was written against the final images after viewing each one.
- Not verified: no kickoff has been sent to Orbis. `audioPrompt` values have not been sent to `set_audio_prompt`. guideFacts are well-known facts written from memory; they were not checked against a source today.
- Mocked or stubbed: none
- Needs from others: nothing. Note for the architect: the contract has a single `audioPrompt` per destination, so the same ambience is used in flight and on the ground.
- Next: seed generator and images.

### 2:33 PM PST — Seed generator and images (`scripts/generate-seeds.mjs`, `public/destinations/**`)
- Commits: 1ad9c75 feat/seed-generator: add Nano Banana seed image script; 2508266 feat/seed-images: add generated 16:9 seed images for the six presets
- State: pushed
- Usage: `node scripts/generate-seeds.mjs [--force] [id | id/view ...]`, e.g. `node scripts/generate-seeds.mjs --force boston/aerial`. Reads the model name from `lib/nano-banana.ts` (`gemini-2.5-flash-image`), loads `GEMINI_API_KEY` with `@next/env` `loadEnvConfig`, never prints it.
- Verified:
  - Ran the script for all 12 targets, then `--force` for selected targets, then a plain re-run: 12 files written, the re-run reported 12 skips (skip logic works), an unknown-free run exited 0.
  - PNG headers read back for all 12: 1344x756, colour type 2 (truecolour), 1.9–2.8 MB each, about 29 MB in total.
  - Viewed all 12 final images. Each is a photorealistic landscape frame of the right place, with no cockpit, window frame or aircraft parts and no caption or watermark. Aerials look forward toward the landmark area; grounds are eye-level with a path leading forward.
  - `curl` against the running dev server: `/destinations/paris/aerial.png` and `/destinations/venice-beach/ground.png` return 200 `image/png`.
- Aspect ratio, stated plainly: the model's "16:9" setting returns **1344x768, ratio 1.75, which is not 16:9**. The script center-crops 6 px off the top and bottom to 1344x756 (exact 16:9) using `sharp`, which is present in `node_modules` as a Next.js dependency but is not declared in `package.json`. If `sharp` cannot be imported the script still works and logs "NOT exact 16:9" for each file. All 12 committed files are exact 16:9.
- Regenerated during review: `tokyo/ground` (first take had a soft-drink brand logo on a vending machine), `paris/ground` (garbled shop lettering), `boston/aerial` (dark smudge in the sky). Nine images were also regenerated after I briefly used a sharp PNG option that silently quantized them to 256 colours; that option is removed and commented in the script.
- Known imperfections in the committed images:
  - `paris/ground` still has one small illegible scribble on an awning; a "no entry"-style round road sign is visible.
  - `venice-beach/aerial` shows a pier with a small building at its end and a road beside the sand; it reads as a Southern California beach but is not a geographically exact view of Venice.
  - `new-york-city/ground` shows people in winter coats while the default state is a clear day.
  - Files are large (about 2.4 MB each). The start image is uploaded to Reactor at every start; if that upload is slow at the venue, converting to JPEG would cut it roughly tenfold, but whether Reactor accepts JPEG was not tested, so PNG (the starter's proven format) was kept.
- Not verified: none of the images has been used as an Orbis start image. `--force` without sharp installed was not exercised.
- Mocked or stubbed: none
- Needs from others: architect — decide whether `sharp` should become a declared devDependency. Winston may replace any file in place (same name, 16:9 PNG) without code changes.
- Next: Phase 2 routes `/api/sim/command` and `/api/sim/guide`.
