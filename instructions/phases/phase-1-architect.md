# Phases 1–3 — integration status (architect)

Written 3:00 PM PST. The build ran ahead of the roadmap: Phases 2 and 3 were implemented before Gate 1 was run, so all three gates are now waiting on Winston's live checks.

## Gate 1 — not yet run

- typecheck: pass (architect, 2:56 PM, tree at `71fddcb`)
- build: pass (qa-reviewer, 2:41 PM, tree at `6e4c128`); not re-run since
- Unit tests: 336/337 at 2:41 PM. The one failure (B-1) is fixed in `843d249`; the full suite has not been re-run since. qa-reviewer's second pass is in progress.
- Live check by Winston: **not run**. Nothing past the Reactor boundary has been exercised: connect, seed upload, `set_image`, first frames, steering response, audio, End flight.
- Decision: pending.

## What is implemented and pushed

| Area | Owner | State | Evidence |
| --- | --- | --- | --- |
| Prompt compiler, six presets, 12 seed images | backend-dev | pushed | [phase-1-backend.md](phase-1-backend.md) |
| Gallery, flight deck, keys, HUD, scheduler, mission log | frontend-dev | pushed, dry-run only | [phase-1-frontend.md](phase-1-frontend.md) |
| Command and guide routes | backend-dev | pushed, smoke-tested | [phase-2-backend.md](phase-2-backend.md) |
| Situation buttons, command box, voice, guide | frontend-dev | pushed, dry-run only; **voice untested** | [phase-2-frontend.md](phase-2-frontend.md) |
| Kickoff and seed routes | backend-dev | pushed, smoke-tested | [phase-3-backend.md](phase-3-backend.md) |
| Landing, tour, take-off, run-limit restart, upload flow | frontend-dev | pushed, dry-run only; **run-limit restart never executed** | [phase-3-frontend.md](phase-3-frontend.md) |
| Tests and reviews | qa-reviewer | pushed | [phase-1-qa.md](phase-1-qa.md) |

## Defects from QA's first pass

| Id | Owner | Status |
| --- | --- | --- |
| F-1 two steers under one chunk apart | frontend-dev | fixed in `90a2699`, with a pacing test; awaiting QA re-check |
| P0-2 running dev server predates the cleanup-script change | Winston | restart requested before Gate 1 |
| P0-1 Reactor 401 shown as a demo-code prompt | architect | fixed in `3b697fc`, typecheck only |
| F-2 dry-run flag false on remount | frontend-dev | fixed in `20c7800`, by code reading only |
| B-1 40-word event steer | backend-dev | fixed in `843d249`, ad hoc check only |

## Architect changes since Phase 0

- `3b697fc` feat/token-route: report upstream Reactor failures as 502.
- `c924c17` chore/pnpm-config: record declined install scripts. `pnpm install --frozen-lockfile` exited 1 before and 0 after.
- `859f2f4` chore/lockfile: remove the stale npm lockfile.
- `2694a75` docs/readme: rewrite for StratoFalcon.

## Open questions the live check must answer

1. Does a 2–3 MB PNG seed upload fit inside the ten-second start budget?
2. Each `set_prompt` replaces the last. After "bank left" then "climb", does the stream keep banking? If not, steers need to carry the other active controls.
3. Dynamic or Stable as the default.
4. Does `reset` followed by `set_image` and `start` work for the landing switch?
5. Does `start` alone resume after `generation_complete` at the run limit?

## Deviations to note

- frontend-dev added `tests/steer-pacer.test.ts` (qa-reviewer's path) at the architect's request for a test; qa-reviewer takes ownership.
- Phase 0 commit `b65fe41` touched paths later assigned to backend-dev and frontend-dev; it landed before the agents started.
- The Vercel deployment has not been started. It needs an access code chosen by Winston and his go-ahead to put the API keys into the Vercel project.
