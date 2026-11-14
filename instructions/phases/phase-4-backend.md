# Phase 4 — backend-dev handoffs

### 3:33 PM PST — Steering v2: `compileMotionPrompt` and `describeMotion`
- Commits: c22c12b feat/prompt-compiler: add whole-motion camera prompt for last-write-wins steering
- State: pushed. **No prompt from this function has been seen on a live stream.** Everything below is about the text only; whether it steers better is unknown until Winston re-flies.
- Exports added to `lib/sim/prompt-compiler.ts` (all earlier exports are unchanged and still pass my earlier ad hoc check):
  - `compileMotionPrompt(next: SimState, prev?: SimState): string`
  - `describeMotion(state: SimState): string`
- What `compileMotionPrompt` returns, in this order:
  1. Always one camera-motion sentence for `next.mode` carrying every control at once. Flight: `The aerial POV camera continues its <slow|steady|fast> push forward [low over the ground | high above the ground], <pan>, <rise or descent>.` Tour: `The eye-level POV camera <walks steadily forward | stands still>, <pan>, <tilt>.` Neutral is said explicitly ("level and straight" / "level and facing straight ahead"). No scene, place, weather or light words in this sentence.
  2. Only when `prev` is given: `The weather changes from <prev> to <next>.` and/or `The time of day changes from <prev> to <next>.` for each field that differs. Unchanged weather and light are never restated.
  3. The event sentence, only when `next.event` is non-null and differs from `prev.event` by `id` or `prompt`, or when `prev` is omitted. It is cut to 39 words.
- Deterministic for the same `(next, prev)`. Controls of the other mode never appear. Altitude `mid` adds no words; `low` and `high` do, so a command such as "take us lower" still changes the prompt.
- Why the earlier steering was weak — confirmed by reading my own v1 sentences: each v1 steer was a single-control sentence (for example only the bank), so when it replaced the active prompt the previous control was gone; v1 also carried weather and light for one prompt only, and a queue of three changes needed three chunk boundaries to be sent.
- Verified (ad hoc Node script, not committed; `node --experimental-strip-types`), result "ALL MOTION CHECKS PASSED":
  - All 93 control combinations (81 flight, 12 tour) without `prev`: non-empty, exactly one sentence, 9–28 words, all 93 strings distinct, identical on a second call with a cloned state, correct opening for the mode, none of the words no / not / never / without / none / nothing / stop / n't, no preset place name, none of roll / steep / shake / wobble / turbulence / cinematic / dynamic, and no weather or light word.
  - For each of those 93, every one of the 24 environments gives the same string without `prev`, and the same string when `prev` has the same environment (nothing is restated).
  - All 576 environment transitions (24 previous x 24 next) on the longest motion sentence: sentence count is 1 plus one per changed field, the motion sentence comes first, and the longest total is **59 words**.
  - Events: appended without `prev`; appended when `prev` has no event; left out when `prev` has the same event; appended again for a new id; nothing added when the event is cleared; a 60-word event prompt is cut to 39 words.
  - `pnpm typecheck` — exit 0.
- Six sample prompts, verbatim from that run:
  1. Flight, neutral (12 words), HUD "Straight · level · cruise · mid":
     > The aerial POV camera continues its steady push forward, level and straight.
  2. Flight, bank left + climb + fast + low (28 words), HUD "Turning left · climbing · fast · low":
     > The aerial POV camera continues its fast push forward low over the ground, panning slowly left with the horizon level, rising steadily as the ground drops away below.
  3. Flight, bank right + descend + slow + high (27 words), HUD "Turning right · descending · slow · high":
     > The aerial POV camera continues its slow push forward high above the ground, panning slowly right with the horizon level, descending steadily as the ground comes closer.
  4. Flight, same turn as 2, weather clear → storm and day → night, `prev` given (58 words):
     > The aerial POV camera continues its fast push forward low over the ground, panning slowly left with the horizon level, rising steadily as the ground drops away below. The weather changes from clear skies to a heavy thunderstorm with rain and lightning. The time of day changes from midday to night, with a dark sky and glowing lights.
  5. Flight, neutral, new event, `prev` given with the same sunset so the light is left out (23 words):
     > The aerial POV camera continues its steady push forward, level and straight. A flock of white birds sweeps past ahead of the camera.
  6. Tour, walk + turn left + look up, weather clear → rain, `prev` given (26 words), HUD "Walking · turning left · looking up":
     > The eye-level POV camera walks steadily forward, panning slowly left, tilting slowly upward. The weather changes from clear skies to steady rain with wet, shining surfaces.
  - Extra, tour standing neutral: "The eye-level POV camera stands still, level and facing straight ahead."
- Not verified:
  - Any effect on the stream: whether "pan" produces a visible turn, whether three clauses in one sentence blur into a morph (the Orbis guide warns about compound actions), and whether "slowly" makes turns too weak.
  - Vitest: I did not run `pnpm test`; qa-reviewer has no tests for these two functions yet.
- Risks the frontend and architect should know:
  - A weather or time-of-day change sentence is present in exactly one prompt. If another prompt replaces it before that change has landed (about 2–4 s), the change may never appear, and nothing will send it again because `prev` has already moved on. The safe rule is to advance `prev` only for a prompt that stayed active for at least one full chunk, or to pass the last state whose environment prompt was held that long.
  - The same applies to events.
  - With an uploaded photo the motion sentence says nothing about light or weather, so the seed image's own look is left alone until the viewer changes the environment.
- Mocked or stubbed: none
- Needs from others: frontend-dev — call `compileMotionPrompt(state, lastSentState)`, dedupe on the returned string, and note the risk above. qa-reviewer — tests welcome. Winston — a live re-fly is the only real test.
- Tuning: all wording is in the phrase tables directly above `motionSentence` in `lib/sim/prompt-compiler.ts` (`MOTION_SPEED`, `MOTION_ALTITUDE`, `MOTION_BANK`, `MOTION_PITCH`, `MOTION_MOVE`, `MOTION_TURN`, `MOTION_GAZE`, `WEATHER_FROM`/`WEATHER_TO`, `TIME_FROM`/`TIME_TO`).
- Next: wording changes from Winston's re-fly.

### 3:36 PM PST — Venice Beach aerial regenerated
- Commits: 811b0f2 feat/seed-images: regenerate the Venice Beach aerial with the skatepark, boardwalk and canals
- State: pushed
- Change: new `public/destinations/venice-beach/aerial.png`, a new seed prompt for it in `scripts/generate-seeds.mjs`, and a matching `aerialKickoff` and tagline in `lib/sim/destinations.ts`. Same file name and extension, so no frontend change.
- Verified: generated once with `node scripts/generate-seeds.mjs --force venice-beach/aerial` (1344x756, exact 16:9, 2.3 MB) and viewed it: a concrete skatepark bowl with palms on the sand in the foreground, a crowded boardwalk running straight ahead past buildings with bright murals, wide beach and surf on the left, a canal with an arched footbridge on the right, hazy mountains, no pier, no legible text, no aircraft parts. My manifest check prints "DESTINATIONS OK" (kickoff is 86 words, 3 sentences, no negation). `pnpm typecheck` exit 0. The dev server serves the new file (200, 2,399,369 bytes).
- Not verified: I did not re-run `/api/sim/kickoff` on the new image to see what the model names it. It is a generated image and is not geographically exact (the real canals are a few blocks inland, not beside the boardwalk). Not used as an Orbis start image yet.
- Mocked or stubbed: none
- Needs from others: nothing
- Next: none pending.
