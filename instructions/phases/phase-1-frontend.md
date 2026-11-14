# Phase 1 — frontend-dev handoffs

### 2:22 PM PST — 1. Preserve the starter at /starter
- Commits: 7f51c2d feat/starter-route: move the Orbis starter UI to /starter and scope its styles
- State: pushed
- Verified: `pnpm typecheck` clean; `curl http://localhost:3000/starter` and `/` both returned 200.
- Not verified: no browser check of the starter page layout after its CSS was scoped under `.starter`; no live Reactor session (Winston only).
- Mocked or stubbed: `app/page.tsx` was a temporary placeholder at this commit (replaced by the gallery in item 3).
- Needs from others: nothing
- Next: store

### 2:27 PM PST — 2. Simulation store
- Commits: 2ad9bd6 feat/sim-store: add zustand simulation store with mission log
- State: pushed
- Verified: `pnpm typecheck` clean against backend-dev's pushed `lib/sim/prompt-compiler.ts` (47c4558).
- Not verified: no unit tests for the store; not exercised in a browser yet.
- Mocked or stubbed: none
- Needs from others: nothing
- Next: destination gallery

### 2:31 PM PST — 3. Destination gallery (home page)
- Commits: 2a2d4ec feat/destination-gallery: add preset gallery with photo upload as the home page
- State: pushed
- Verified: `pnpm typecheck` clean. Browser (dev server, 1600x900): the six presets from `lib/sim/destinations.ts` render with their aerial images, name, tagline and a gate code; upload card present. In a dry run a generated 900x900 PNG was fed to the upload input and came out as a 1280x720 blob seed and opened the deck.
- Not verified: the missing-image placeholder was not seen in a browser (all six images exist); upload was not flown against Orbis; 4K and phone widths not checked.
- Mocked or stubbed: none. A temporary `components/destinations.stub.ts` was written and deleted before this commit, once the real manifest was on disk; it was never committed.
- Needs from others: nothing
- Next: flight deck

### 2:33 PM PST — 4. Flight deck
- Commits: a6c2525 feat/flight-deck: connect to Orbis on destination choice and start the flight from its seed image; b93d980 feat/flight-deck: add fallbacks so the launch overlay cannot stay up over a live stream
- State: pushed. NOT tested live.
- Verified: `pnpm typecheck` clean. Dry run (`/?dry=1`) in a browser: choosing Paris opens the deck, shows the launch overlay, then the still seed image; End flight returns to the gallery; no request to `/api/*` was made. `/starter` still renders (Connect, Start run, Pause, Resume, Reset buttons present, starter styles applied) after the JWT wiring moved to `hooks/use-reactor-jwt.ts`.
- Not verified: everything past the Reactor boundary. No agent opened a session, so connect, token fetch, seed upload, `set_image`, `set_audio_prompt`, `set_prompt`, `start`, the first-frame overlay lift, ReactorView playback, audio, End flight on a live session, the dropped-session and `generation_complete` overlays and the Retry button are all untested.
- Mocked or stubbed: `?dry=1` is a labeled dry run (badge in the gallery and top bar, system line in the log). It never connects.
- Needs from others: Winston's Gate 1 live check.
- Next: controls and HUD

### 2:35 PM PST — 5. Keyboard controls, HUD, instant feedback
- Commits: 95cdeb4 feat/flight-controls: add latched keyboard controls, HUD and instant video feedback
- State: pushed
- Verified: `pnpm typecheck` clean. Dry run in a browser: synthetic `keydown` for A and W changed the HUD text ("Bank left / Climbing"), lit the W and A keycaps, tilted the HUD horizon and set the video-layer transform within 50 ms with no network request. A held climb moved altitude mid to high after about 7 s and then levelled off.
- Not verified: real key presses by a person; the look of the CSS roll over real moving video; the input/textarea focus guard (there is no text field on the deck yet).
- Mocked or stubbed: none
- Needs from others: nothing
- Next: steer scheduler

### 2:37 PM PST — 6. Steer scheduler
- Commits: d82b5c8 feat/steer-scheduler: send one compiled steer per chunk boundary and track applied prompts
- State: pushed. NOT tested live.
- Verified: `pnpm typecheck` clean. Dry run with a simulated 1.83 s chunk clock: three simultaneous inputs drained as 3 queued, 2, 1, 0, one sentence per simulated chunk, the first after the 250 ms debounce.
- Not verified: against Orbis. Unverified assumptions: `chunk_complete` reaches `useReactorMessage`; `prompt_accepted` comes back as the `sendCommand` reply or as a message; Dynamic's `active_prompt` equals the sent text exactly.
- Mocked or stubbed: the dry-run chunk clock (timer) stands in for `chunk_complete`.
- Needs from others: nothing. Uses `compileSteerSteps` (prompt plus its single-field delta) from the compiler rather than `compileSteerQueue`, so `lastSentState` advances by exactly the change that was sent.
- Next: mission log

### 2:39 PM PST — 7. Mission log
- Commits: e12636b feat/mission-log: show inputs, state changes and sent prompts beside the video
- State: pushed
- Verified: `pnpm typecheck` clean. Dry run in a browser: inputs, state changes, system lines and the exact prompt sentences appear newest first, prompts flip from Pending to Applied, the state readout and the prompt/pending counters update.
- Not verified: Pending to Applied timing against real Orbis events; legibility on the actual projector.
- Mocked or stubbed: none
- Needs from others: nothing
- Next: Gate 1 fixes, then Phase 2 (situation buttons, command box, voice, guide captions).
