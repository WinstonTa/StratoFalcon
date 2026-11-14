# Phase 2 — frontend-dev handoffs

All times PST. Nothing in this file was tested against a live Reactor session. "Dry run" means `/?dry=1`: the deck with a timer in place of `chunk_complete`, prompts logged but not sent, no session opened. The Gemini routes were called for real in the dry run.

### 2:44 PM — QA fixes F-1, F-2 and the starter wording
- Commits: 90a2699 feat/steer-scheduler: send steers only at chunk boundaries with a minimum gap (QA F-1); 20c7800 feat/dry-run: read the dry-run flag synchronously so a remount cannot connect (QA F-2); 59fd689 uiux/starter-player: make the connect placeholder model-neutral
- State: pushed
- Verified: `pnpm typecheck` clean. `pnpm exec vitest run tests/steer-pacer.test.ts`: 4 of 4 passed (three simultaneous inputs at 61 chunk phases always leave at least 1830 ms apart; sends land only on chunk boundaries while chunks flow; the silent-clock fallback waits 2.5 s and keeps a 1.7 s gap). Dry run afterwards: prompts in the log are 2 s apart.
- Not verified: against Orbis. F-2 by code reading only (reproducing it would open a session). The full `pnpm test` suite was not run by me.
- Mocked or stubbed: none
- Needs from others: qa-reviewer, note that `tests/steer-pacer.test.ts` is a new file written by frontend-dev at the architect's request, in your path.
- Next: situation buttons

### 2:46 PM — 1. Situation buttons
- Commits: c5dda21 feat/situations: add instant weather, time-of-day and one-shot event buttons; a9bda80 feat/sim-client: add fetch wrappers for the sim routes and mode actions in the store
- State: pushed
- Verified: typecheck clean. Dry run: Storm and Fireworks each logged an input and a state change at once and their sentences went out one per chunk; the event chip cleared after its sentence was sent. Tour events show in tour mode (Flock of pigeons sent after a dry-run landing).
- Not verified: how Orbis renders each event sentence.
- Mocked or stubbed: none
- Needs from others: backend-dev may want to review the eight event sentences in `components/situation-panel.tsx`.
- Next: command box

### 2:47 PM — 2 and 3. Command box and voice
- Commits: 46dc060 feat/copilot: add the command box and push-to-talk voice through /api/sim/command (one commit for both items; they share `hooks/use-copilot.ts` and `components/command-bar.tsx`)
- State: pushed
- Verified: typecheck clean. Dry run with the real route: "make it sunset and take us lower" logged the input, Gemini's reply ("Setting time to sunset and dropping to low altitude."), the state change, and two prompts; "Co-pilot thinking…" showed while pending; the box lost focus after Enter. A `keydown` for W dispatched on the focused input did not change pitch (key guard holds).
- Not verified: voice, at all. The automation browser has no microphone, so the SpeechRecognition path (interim transcript, release-to-send, the error messages, the hold-V shortcut) is untested. The "Voice needs Chrome" state was not seen because the test browser has the API. Route errors and the 504 path were not forced.
- Mocked or stubbed: none
- Needs from others: Winston to try the mic at Gate 2.
- Next: guide

### 2:49 PM — 4. Guide
- Commits: e4ae025 feat/guide: caption, log and speak Gemini guide lines with a voice toggle
- State: pushed
- Verified: typecheck clean. Dry run with the real route: a line arrived 3 s after the controls came up, showed as a caption and a Guide log entry, and `speechSynthesis.speaking` was true; End flight stopped it.
- Not verified: the 20 s cadence over a long flight, the after-change trigger, and how the spoken voice sounds over Orbis audio.
- Mocked or stubbed: none
- Needs from others: nothing
- Next: Phase 3
