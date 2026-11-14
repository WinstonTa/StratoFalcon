# Phase 3 — frontend-dev handoffs

All times PST. Nothing in this file was tested against a live Reactor session. "Dry run" means `/?dry=1`: no session, a timer in place of `chunk_complete`, a still seed image in place of the stream.

### 2:52 PM — 5, 6 and 7. Landing, tour controls and HUD, takeoff, run-limit restart
- Commits: 96e6eea feat/landing-tour: add landing, tour controls and HUD, takeoff and run-limit restart (one commit; the three items share the deck's view-switch code and would not typecheck separately)
- State: pushed. NOT tested live.
- Verified: `pnpm typecheck` clean. Dry run on Tokyo: L showed "Final approach" with the descent steer sent, then the Landing overlay, then tour mode with W/S/A/D/Q keys, the tour HUD and tour event buttons; W, A and Q latched and their sentences went out one per chunk; T returned to flight mode with the flight keys.
- Not verified: every Reactor step of the switch: `reset`, waiting for `generation_reset`, the second `set_image` and `start`, and the overlay lifting on the new run's first frames. The run-limit restart (`start` again after `generation_complete`, falling back to reset plus a full start) has never executed, not even in a dry run. Retry after a failed landing was not exercised.
- Mocked or stubbed: none in the live path. The dry run skips the Reactor calls and says so in the log.
- Needs from others: Winston's Gate 3 check.
- Next: upload flow

### 2:54 PM — 8. Upload flow
- Commits: 3043c73 feat/upload-flow: recognise uploaded photos with Gemini and prepare the ground view in the background
- State: pushed
- Verified: typecheck clean. Dry run with the real routes, using the Boston preset image as the upload: a `.heic` file was refused with a message; the "Recognising the place" overlay showed; `/api/sim/kickoff` named it "Boston Skyline and Charles River, Massachusetts"; the deck opened with Land disabled and "Preparing ground view"; `/api/sim/seed` delivered after about 12 s, Land enabled, and landing showed a 1280x720 ground image.
- Not verified: flying or landing an uploaded photo on Orbis; the kickoff-failure fallback to the compiled prompt; the seed-failure state ("Ground view unavailable"); a photo that is not a recognisable place.
- Mocked or stubbed: none
- Needs from others: nothing
- Next: Gate 2 and Gate 3 findings from Winston, then Phase 4 polish.
