# Phase 2 — backend-dev handoffs

### 2:38 PM PST — `POST /api/sim/command`
- Commits: 3a67ab5 feat/sim-command: add text and voice command route backed by Gemini
- State: pushed, smoke-tested against the running dev server (not tested from the UI, not tested with real voice transcripts)
- Files: `app/api/sim/command/route.ts`, `lib/sim/prompts/command.ts` (system instruction + JSON schema), `lib/server/sim-http.ts`, `lib/server/sim-gemini.ts`.
- Behaviour:
  - Request `{ text, state, destinationName }`; response `{ delta: SimStateDelta, say: string }` with `Cache-Control: no-store, max-age=0` and a `Server-Timing: gemini;dur=<ms>` header.
  - Model `ORBIS_PROMPT_MODEL` (`gemini-3.5-flash`), JSON schema output, `thinkingBudget: 0`, temperature 0.1.
  - Server-side sanitizing: contract keys and enum values only (`sanitizeDelta`); only the current mode's controls are kept (tour fields are dropped in flight mode and the reverse); fields that already hold the requested value are dropped; the event gets a server-made id `evt-<label-slug>-<base36 time>` so the same event can fire twice; `say` is cut to 12 words, falling back to "Copy that.".
  - The route never returns `event: null`. An unclear or unrelated command returns `delta: {}` with a `say` asking for a command.
  - 400: body not a JSON object; `text` empty or whitespace; `text` over 500 characters (after trim); `state` missing or `state.mode` not `flight`/`tour`. Missing fields inside `state` fall back to `INITIAL_STATE`. `destinationName` is optional.
  - 500 when `GEMINI_API_KEY` is missing; 502 when Gemini fails or returns non-JSON; 504 when both attempts (4 s, then 6 s) time out.
- Verified (Node `fetch` script against `http://localhost:3000`, 14 commands + 8 validation cases, run after the final code change):
  - `pnpm typecheck` — exit 0.
  - "make it sunset" → `environment.timeOfDay: sunset`; "take us lower over the water" → `flight.altitude: low`; "bank left and speed up" → `bank: left, speed: fast`; "thunderstorm at night" → `night` + `storm`; "level off" from bank left / pitch climb → both `level`; "go faster" when already fast → `delta: {}`; "don't let it rain anymore" from rain → `weather: clear`.
  - "fly through a flock of birds" → event "Flock Of Birds", prompt "A dense flock of pigeons surges through the open air directly ahead of the aircraft."; "fireworks!" → event only, environment untouched; tour "a street parade goes by" → event "Street Parade".
  - Tour mode: "walk forward and look up" → `move: walk, gaze: up`; "climb" → `delta: {}`.
  - "what is the capital of France" and an instruction-override attempt → `delta: {}` with a polite `say`.
  - Validation: empty text 400, 501 characters 400, exactly 500 characters 200, missing state 400, bad mode 400, non-JSON 400, array body 400, `{ mode: "flight" }` only and no destinationName 200, GET 405.
  - Latency in that run: 667–1416 ms end to end (model time 647–1399 ms), all under the 1.5 s target.
- Not verified:
  - **Latency is not guaranteed.** In the first smoke run (before the timeout was added) 3 of 14 calls took 31 s, 44 s and 58 s while the rest took about 1–2 s. I could not reproduce it: 8 direct SDK calls took 436–907 ms and the next 15 route calls were all under 1.5 s. The cause is unknown (the shared dev server or the Gemini API). The 4 s + 6 s attempt deadlines were added because of it; **the timeout and retry path itself has not been exercised**, and neither has the 502 path.
  - Real speech-to-text transcripts, non-English input, and long rambling commands.
  - Event prompts are not checked in code for negation words or for the place name; that relies on the system instruction. The four event prompts seen in testing were clean.
- Mocked or stubbed: none
- Needs from others: frontend-dev — apply `delta` with `applyDelta`, show `say`, and treat non-2xx as "co-pilot unavailable" (body is `{ error }`). qa-reviewer — awkward-input tests welcome.
- Next: guide route.

### 2:42 PM PST — `POST /api/sim/guide`
- Commits: f30a038 feat/sim-guide: add one-line guide narration route backed by Gemini
- State: pushed, smoke-tested against the running dev server (not tested from the UI or with `speechSynthesis`)
- Files: `app/api/sim/guide/route.ts`, `lib/sim/prompts/guide.ts`.
- Behaviour:
  - Request `{ destinationName, guideFacts, state, recent }`; response `{ line }`, plain text, cut server-side to 25 words (the model is asked for 20). Same headers as the command route.
  - Same model, `thinkingBudget: 0`, temperature 0.7 for variety, same 4 s + 6 s deadlines.
  - 400: body not a JSON object; `destinationName` missing or empty; `guideFacts` not an array of strings (an empty array is allowed, for uploads); `recent` present but not an array of strings (omitted is treated as empty); invalid `state`. At most 8 facts and 8 recent lines of 300 characters each are used.
  - 502 when Gemini returns nothing; 504 on timeout.
- Verified (Node `fetch` script against `http://localhost:3000`):
  - `pnpm typecheck` — exit 0.
  - A chain of 7 calls for Venice Beach with 5 facts, feeding each reply back as `recent`: 7 distinct lines of 17–20 words; the first five each used a different fact and tied it to the state ("As we bank left in the sunset…", "Lightning flashes over the dark coast…", "As you walk forward in the rain…"); the last two, with all facts used, spoke only about the moment. No line repeated and no fact was reused. No invented dates or numbers in those 8 lines.
  - Empty `guideFacts` → a line about the flight only.
  - Validation: missing destinationName, non-array facts, non-string fact, non-array recent, missing state, non-JSON body all 400 with `no-store`; GET 405.
  - Latency: 935–1409 ms end to end.
- Not verified: the 502 and 504 paths; behaviour with long `recent` lists beyond 8; whether a line could ever exceed 25 words before the server-side cut (not seen); grounding was checked by reading 8 outputs, not by an automated test, so an invented fact remains possible.
- Mocked or stubbed: none
- Needs from others: frontend-dev — send `recent` newest first and keep it to the last few lines.
- Next: Phase 3 routes (`/api/sim/kickoff`, `/api/sim/seed`) when the architect says go.
