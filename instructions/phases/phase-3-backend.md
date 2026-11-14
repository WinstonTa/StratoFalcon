# Phase 3 — backend-dev handoffs

### 2:44 PM PST — QA fix B-1: event prompts cut to under 40 words
- Commits: 843d249 feat/prompt-compiler: cut over-long event prompts to 39 words
- State: pushed
- Change: `MAX_STEER_WORDS` in `lib/sim/prompt-compiler.ts` is now 39 (it was 40), so an over-long event prompt is cut to 39 words in both `compileSteerSteps` and `applyDelta`/`sanitizeDelta`.
- Verified: read `tests/prompt-compiler.test.ts` lines 344–354 (60-word prompt, expects one steer with fewer than 40 words) and reproduced that input in an ad hoc Node script: prompts of 38, 39, 40, 41 and 60 words gave steers of 38, 39, 39, 39 and 39 words. The earlier ad hoc compiler check still prints "ALL CHECKS PASSED". `pnpm typecheck` exit 0.
- Not verified: I did not run `pnpm test` (qa-reviewer's command), so the vitest result itself is unconfirmed by me.
- Mocked or stubbed: none
- Needs from others: qa-reviewer — re-run the suite.
- Next: Phase 3 routes.

### 2:47 PM PST — `POST /api/sim/kickoff`
- Commits: ac43f0f feat/sim-kickoff: add photo-to-kickoff route for uploaded images
- State: pushed, smoke-tested against the running dev server (not tested from the UI; no returned prompt has been sent to Orbis)
- Files: `app/api/sim/kickoff/route.ts`, `lib/sim/prompts/kickoff.ts`; `lib/server/sim-gemini.ts` gained an optional image input and per-route deadlines; `lib/server/sim-http.ts` gained multipart upload validation.
- Behaviour:
  - Multipart `image` (PNG, JPEG or WebP, 10 MB or smaller), `mode` (`flight` | `tour`), optional `placeHint` (120 characters used). Response `{ name, prompt, guideFacts }`, `Cache-Control: no-store, max-age=0`, `Server-Timing: gemini;dur=<ms>`.
  - Model `gemini-3.5-flash`, JSON schema output, `thinkingBudget: 0`, temperature 0.2, `maxDuration = 60`.
  - **Deadlines differ from the text routes: 15 s, then one 15 s retry.** With the 4 s + 6 s deadlines every one of 5 calls timed out on the first attempt and succeeded on the retry (7.7–9.2 s total), because reading a 2 MB photo takes about 4 s. That run did exercise the timeout-and-retry path of the shared helper, which works.
  - Post-processing: name cut to 80 characters (fallback "Uploaded scene"); prompt cut to 99 words, and a stand-alone "Photorealistic, in one continuous shot." sentence is folded into the previous sentence; if the model returns no prompt the route falls back to `compileKickoff(name, …)`; at most 5 facts of 240 characters.
  - 400: body not multipart; `mode` missing or invalid; `image` missing, empty, not a file, or not PNG/JPEG/WebP. 413 over 10 MB. 500 without the key, 502 on Gemini failure or non-JSON, 504 on timeout.
- Verified (Node `fetch` script, final code):
  - `pnpm typecheck` — exit 0.
  - `public/destinations/paris/aerial.png`, flight → name "Eiffel Tower, Paris"; 54-word, 3-sentence prompt beginning "A first-person aerial view from an aircraft flying forward over Paris…"; 4 facts.
  - `public/destinations/boston/ground.png`, tour → name "Acorn Street, Boston"; 48-word, 3-sentence prompt beginning "A first-person walking view at eye level…"; 4 facts.
  - `dog.png`, flight and tour → names "Golden Retriever at sunset lake" and "Golden Retriever on mountain overlook"; prompts grounded in the photo; facts are plain observations only.
  - `dog.png` with the false hint "Eiffel Tower, Paris" → name "Golden retriever on rocky overlook at sunset"; no mention of Paris anywhere.
  - All 5 prompts: 48–58 words, 3 sentences, no negation words. Latency 3.5–4.2 s, one attempt each.
  - Validation: no image 400, bad mode 400, missing mode 400, text file 400, GIF 400, 10 MB + 1 byte 413, image sent as a string 400, JSON body 400, GET 405.
- Not verified: JPEG and WebP uploads (only PNG was sent); the 502 path; photos of people or indoor scenes; facts for identified places come from the model and were only read by me (the Paris and Boston facts looked right, but nothing checks them); the Boston seed is itself a generated image, so "Acorn Street" is the model's reading of it.
- One transient seen: the first smoke run returned 500 for every request with `readFormData is not a function` in the dev log, because the dev server had not yet hot-reloaded the helper file I had just changed. It cleared within a minute without a code change. Not a route defect, but it shows a hot-reload race on the shared dev server.
- Mocked or stubbed: none
- Needs from others: frontend-dev — expect about 4 s; show the preparing overlay.
- Next: seed route.

### 2:50 PM PST — `POST /api/sim/seed`
- Commits: 8719962 feat/sim-seed: add Nano Banana route that re-views a photo from the other vantage point
- State: pushed, smoke-tested against the running dev server (no returned image has been used as an Orbis start image)
- Files: `app/api/sim/seed/route.ts`, `lib/sim/prompts/seed.ts`, `lib/server/sixteen-nine.ts`.
- Behaviour:
  - Multipart `image` (same rules as kickoff), `view` (`aerial` | `ground` — the vantage point wanted in the result), optional `placeHint`. Response is image bytes (`image/png` when cropped), `Cache-Control: no-store, max-age=0`, `Server-Timing: nano-banana;dur=<ms>`, `X-Seed-Exact-16-9: 1|0`, `X-Seed-Size: <w>x<h>` (only when sharp is available).
  - Model `NANO_BANANA_MODEL` (`gemini-2.5-flash-image`), `imageConfig.aspectRatio: "16:9"`, one attempt with a 45 s deadline, `maxDuration = 60`.
  - Crop: the model returns 1344x768; `lib/server/sixteen-nine.ts` center-crops to 1344x756 with `sharp`, loaded at runtime through `createRequire` with a computed name so it is neither bundled nor required at build time. If sharp cannot be loaded, or the crop throws, the image is returned as generated with `X-Seed-Exact-16-9: 0`.
  - Errors: same validation and status codes as kickoff (`view` instead of `mode`); 502 when the model returns no image or fails; 504 on timeout.
- Verified (Node `fetch` script; I viewed every returned image):
  - `pnpm typecheck` — exit 0.
  - With the final prompt wording: `paris/aerial.png` → `ground`: eye-level gravel promenade with trees, Haussmann buildings and the Eiffel Tower ahead — usable. `dog.png` → `ground`: eye-level dirt path with the dog, pines, lake and sunset — usable. `dog.png` → `aerial`: forward view from above the treetops over the same lake and mountains — usable; the model added cabins and the dog is no longer visible.
  - With the earlier, weaker wording only: `venice-beach/ground.png` → `aerial` with hint "Venice Beach, California": aerial view along the boardwalk, palms and sand — usable. Not re-run after the wording change.
  - All returned files: PNG, 1344x756, truecolour, 1.9–2.6 MB, `X-Seed-Exact-16-9: 1`.
  - **Latency: 9.1–10.8 s per call** (model time 9.0–10.6 s) across 7 calls.
  - Validation: no image 400, bad view 400, missing view 400, GIF 400, 10 MB + 1 byte 413, JSON body 400, GET 405.
- Defect found and fixed during testing: with the first prompt wording, `paris/aerial.png` → `ground` came back as nearly the same aerial picture. The prompts now state the camera height and forbid repeating the reference framing; the re-run gave a real ground view. One success per case is not proof it always works: **the model can still return the wrong vantage point, and the route cannot detect that.**
- Not verified: the no-sharp path (on Vercel sharp may not be traced into the function, in which case seeds come back 1344x768, ratio 1.75, not exact 16:9); the 502 and 504 paths; JPEG/WebP input; behaviour under several concurrent calls.
- Mocked or stubbed: none
- Needs from others: frontend-dev — budget about 10 s, call it in the background, pass the kickoff `name` as `placeHint`, and keep a fallback if it fails or the image is unusable. architect — if exact 16:9 matters on Vercel, check `X-Seed-Exact-16-9` on the deployment.
- Next: prompt tuning from Winston's live observations.

### 2:50 PM PST — `maxDuration` on the command and guide routes
- Commits: b134596 chore/sim-routes: set maxDuration on the command and guide routes
- State: pushed
- Change: `export const maxDuration = 30` in `app/api/sim/command/route.ts` and `app/api/sim/guide/route.ts`.
- Verified: `pnpm typecheck` exit 0; after the change one command call ("make it sunset" → sunset, 968 ms) and one guide call (200, 0.6 s) against the dev server.
- Not verified: the setting has no effect locally; its effect on Vercel is untested.
- Mocked or stubbed: none
- Needs from others: nothing
- Next: none pending.
