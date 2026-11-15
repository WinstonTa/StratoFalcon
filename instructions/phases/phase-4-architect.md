# Phase 4 — freeze and handoff (architect)

Written 4:32 PM PST, 2026-11-14. Winston called the build good enough for the demo and deferred further improvement, so the code is frozen here, half an hour ahead of the planned 5:00 freeze.

## Where the code is

- Repository: `WinstonTa/StratoFalcon`, branch `main`, local and remote in sync.
- Frozen product code: `c0d823d` (last product commit). Head at the time of writing: `514b998` (documentation only after that).
- Live site: <https://stratofalcon.vercel.app/> (Winston's Vercel project, rebuilt on each push to `main`).

## Final gates — 4:30 PM, tree at `514b998`

- typecheck: pass
- build: pass
- Unit tests: 424/424 across 9 files
- No `.env`, `.env.local`, `.reactor-dev-sessions.json` or `.vercel/` files are tracked.
- Live site: home page answers 200.

## Live verification, as reported by Winston

| Path | State | Source |
| --- | --- | --- |
| Preset flight, keyboard steering | tested live | first flight, about 3:00 PM |
| Situation buttons, typed commands | tested live | first flight |
| Turn direction (`D` turns right on Normal) | tested live | third re-fly, 4:05 PM |
| Landing, tour, upload, voice | tested live | "All work", about 4:15 PM |
| Overall | "not perfect but good enough for the demo" | 4:30 PM |

Winston's reports were short. They do not say which destination, which model setting or how many attempts, and take-off was not named separately.

## Not verified

- **Run-limit restart.** Orbis Dynamic ends a run at about seven minutes. The automatic restart has never executed, live or in dry run. Keep demo flights short.
- **The access-code gate on a real deployment.** `DEMO_ACCESS_CODE` is not set on the Vercel project: at 4:31 PM the live token route still issued a token to a request with no code. The gate and the browser prompt are covered by unit tests only.
- **Orbis Stable.** Never compared with Dynamic.
- **1080p delivery**, `set_audio_prompt`, and the Retry path after a failed start or landing: no one has confirmed them on a stream.
- **Which commit the live site serves.** The Vercel account connected to the architect's session does not contain this project, so build status was never visible.
- qa-reviewer has not reviewed the last round (`9346850`, `e26779c`, `c0d823d`, `77ff5d8`, `b7046ec`). The architect ran the gates instead.

## Known weaknesses going into the demo

- Steering is prompt-driven: a change takes 2–4 seconds to appear and this cannot be shortened on our side. Winston judged strength and speed acceptable, not good.
- The mission log shows the prompt wording, so a right turn logs "scene sliding left" beside a HUD reading "Turning right".
- Pressing the same event twice in a row sends identical text, and Orbis may show nothing new.
- The ground view for an uploaded photo comes from an image model that can return the wrong vantage point; nothing detects that.
- Seed images are 1.9–2.8 MB PNGs uploaded on every start.
- The public site is open until the access code is set.

## Before going on stage

1. Set `DEMO_ACCESS_CODE` on the Vercel project and redeploy, or accept that the link is open.
2. Rehearse the script in section 10 of the master document twice, and record the screen once as the fallback.
3. In the demo browser: enter the code if asked, confirm Turn sense reads Normal, click Enable sound, allow the microphone.

## After the demo

In rough order of value:

1. Fly Orbis Stable against Dynamic and pick a default from observation.
2. Tune turn and climb wording against a live stream. The phrase tables are at the top of the motion section of `lib/sim/prompt-compiler.ts`.
3. Exercise the run-limit restart and the Retry paths on a live stream.
4. Show the key pressed next to each prompt in the mission log.
5. Convert seed images to JPEG if Reactor accepts them, to cut start time.
6. Give a repeated event varied wording so the second press is visible.
7. Reconnect the Vercel connector with the account that owns this project so builds and environment settings can be checked.

## How the four agents were used

| Agent | Work | Notes |
| --- | --- | --- |
| architect | Plan, contract, token route, access gate, integration, the third steering wording round, all contact with Winston | Edited a backend path and a test file directly in the last round; recorded in [change-steering-rework.md](change-steering-rework.md) |
| backend-dev | Prompt compiler (three versions), six presets and seed images, four Gemini routes | [phase-1](phase-1-backend.md), [phase-2](phase-2-backend.md), [phase-3](phase-3-backend.md), [phase-4](phase-4-backend.md) |
| frontend-dev | Gallery, flight deck, HUD, scheduler (three versions), situations, command box, voice, guide, landing, tour, upload | [phase-1](phase-1-frontend.md), [phase-2](phase-2-frontend.md), [phase-3](phase-3-frontend.md), [phase-4](phase-4-frontend.md) |
| qa-reviewer | 424 tests, three review passes, eleven defects found | [phase-1](phase-1-qa.md), [phase-2](phase-2-qa.md), [phase-4](phase-4-qa.md) |

The named agent types in `.claude/agents/` were not registered in the session that created them, so all three ran as general-purpose agents reading their role files. A new session should pick the named types up.

## Next safe action

Nothing needs to change before the demo. Any push to `main` rebuilds the live site, so do not push product code between now and the demo unless something is broken on stage.
