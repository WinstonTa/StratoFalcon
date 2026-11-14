# Phase 0 — Foundation (architect)

## Decisions confirmed by Winston

- Presets: Paris, Tokyo, Los Angeles, New York City, Boston, Venice (California).
- Reactor $200 promo credit is claimed.
- Direct-to-`main` commits authorized for this sprint; push continuously per the playbook.

### 2:30 PM PST — foundation and contract
- Commits:
  - `a01a14f` docs/master-plan: add master instructions, phase notes and agent definitions
  - `d7252e1` feat/sim-contract: add shared simulation and API types
  - `b65fe41` feat/orbis-config: authorize both Orbis models and gate the token route
  - `0dc4cb6` chore/test-tooling: add vitest and a test script
- State: pushed
- Verified: `pnpm typecheck` exits 0; `vitest --version` reports 5.1.0; `http://localhost:3000` still returns 200 after the changes.
- Not verified: the token route against a live Reactor session (both-model authorization, the 900 s cap and the `DEMO_ACCESS_CODE` gate are untested live); `pnpm build`.
- Mocked or stubbed: none
- Needs from others: Winston's live check at Gate 1 covers the token route.
- Next: agents run their Phase 1 lanes; architect integrates and prepares Gate 1.

## Changes from the plan as first written

- Package manager is **pnpm**, not npm: `node_modules` was installed with pnpm. `package-lock.json` is now stale and must be resolved before the Vercel deployment.
- The model setting is `NEXT_PUBLIC_ORBIS_MODEL` (client-visible, since the browser picks the model when it connects). The model list lives in `lib/orbis.ts`.
- The dev server is Winston's, already running on port 3000. No agent starts or restarts one.
- `pnpm add` reported ignored build scripts for `@google/genai` and `protobufjs`. Vitest installed correctly; the build scripts were left unapproved.

## Agents launched (2:32 PM)

The named agent types in `.claude/agents/` are not registered in the running session, so the three roles were launched as general-purpose agents that read their role files:

- backend-dev: prompt compiler, destination manifest, seed images, then the command and guide routes.
- frontend-dev: starter moved to `/starter`, store, gallery, flight deck, keyboard controls, steer scheduler, mission log.
- qa-reviewer: baseline gates, Vitest harness, compiler and manifest tests, commit review, smoke checks.
