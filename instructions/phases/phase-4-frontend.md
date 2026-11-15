# Phase 4 — frontend-dev handoffs

All times PST. Nothing in this file was tested against a live Reactor session. "Dry run" means `/?dry=1`: no session, prompts logged but not sent, a 1.83 s timer standing in for `chunk_complete`.

### 3:33 PM — 2 and 3. Comfort and controls
- Commits: 6b79926 uiux/steady-video: remove all video motion, add a plain-language HUD readout and drop altitude auto-stepping
- State: pushed
- Verified: `pnpm typecheck` clean. Dry run: the video layer has no transform at rest or after A and W; the readout reads the motion and how to cancel it; W and A keycaps stay filled; a chip click left focus on the deck and the next key press steered; a 12 s held climb moved only the local altimeter (1500 to 3190 ft) and produced no system line and no extra prompt.
- Not verified: whether it reads as comfortable on the projector; real key presses on Winston's machine.
- Mocked or stubbed: none
- Needs from others: nothing
- Next: steering v2

### 3:34 PM — 5. Demo access code on the sim routes
- Commits: bbf184e feat/demo-code: send x-demo-code from every sim route wrapper and prompt once on a 401
- State: pushed
- Verified: typecheck clean; with no code set locally the guide and command routes still answered in a dry run.
- Not verified: the 401 path. No local run had `DEMO_ACCESS_CODE` set, so the prompt, the retry and the stored-code reuse were not exercised. `/api/session-cleanup` and `/api/session-registry` are not sent the header.
- Mocked or stubbed: none
- Needs from others: architect to try the gated Vercel deployment once.
- Next: steering v2

### 3:38 PM — 1. Steering v2, and QA L-1
- Commits: bc33334 feat/steering-v2: send one whole-motion prompt per change, last-write-wins, paced at 1.9 s
- State: pushed. NOT tested live.
- Verified: typecheck clean. `pnpm exec vitest run tests/steer-pacer.test.ts`: 9 of 9 passed. `tests/sim-store.test.ts` and `tests/flight-controls.test.ts`: 21 of 21 passed after the store change. Dry run: A, W and R together gave one prompt at 162 ms; a later D, Storm and Fireworks were held ("Steering · next update in 1.4 s") and left as one prompt at 2064 ms; the next prompt at 3964 ms did not restate the weather; the event chip cleared on confirmation. Landing while banked: the descent prompt left at T+7 s and touchdown followed at T+11 s.
- Not verified: against Orbis. In particular whether one prompt per 1.9 s looks calmer, and whether `chunk_complete.active_prompt` equals the sent text so confirmation is prompt.
- Mocked or stubbed: the dry-run timer confirms prompts in place of `chunk_complete`.
- Needs from others: qa-reviewer, `tests/steer-pacer.test.ts` was rewritten by frontend-dev (the one-per-chunk tests described the removed queue); please review and run the full suite.
- Next: guide fixes

### 3:39 PM — 4. Guide fixes (QA L-2, L-3) and 1080p
- Commits: 480c1c0 feat/guide: never interrupt a spoken line, respect the gap on every trigger, drop stale replies (QA L-2, L-3); 729fabc feat/resolution: request 1080p delivery when the session offers it
- State: pushed
- Verified: typecheck clean. Dry run: the first guide line still arrives after takeoff; landing and tour still work.
- Not verified: L-2 and L-3 were fixed by code and not re-measured with delayed replies; the microphone hold was not exercised (no microphone in the automation browser); `set_resolution` has never been sent to Orbis by this code.
- Mocked or stubbed: none
- Needs from others: qa-reviewer to re-run the L-2 and L-3 checks.
- Next: Winston's re-fly findings.

### 4:01 PM — Second steering pass: turn sense, faster pacing, QA S-1 and C-1
- Commits: 9346850 feat/steering-pacing: shorten the debounce to 80 ms and the send gap to 1.2 s, always send a newly pressed event (QA S-1); e26779c feat/demo-code: reuse the entered code so concurrent 401s prompt once (QA C-1); c0d823d feat/turn-sense: add a persisted Normal/Flipped turn-sense switch that recompiles and resends the motion
- State: pushed. NOT tested live.
- Verified: `pnpm typecheck` clean before each push. `pnpm exec vitest run tests/steer-pacer.test.ts tests/demo-code.test.ts`: 17 of 17 passed, including the two cases that failed before (S-1 "fires the same event again" and C-1 concurrent 401s). Dry run on Paris: D gave a prompt ending "the scene sliding left across the frame"; clicking Flipped resent it as "the scene sliding right" while the HUD kept "Turning right"; Normal resent the original; `localStorage` held 1 then 0; focus stayed on the deck.
- Not verified: which turn sense is right for Orbis (that is the calibration Winston does), and whether 1.2 s pacing looks better or brings the morphing back.
- Mocked or stubbed: none
- Needs from others: qa-reviewer, two expectations in `tests/steer-pacer.test.ts` were edited by frontend-dev at the architect's request (the key-during-debounce offsets and the mash-test ceiling now use the exported constants). The S-1 test was not edited.
- Next: Winston's calibration result; if Flipped is right, make it the default.
