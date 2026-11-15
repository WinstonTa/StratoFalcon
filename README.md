# StratoFalcon

A live flight and tourist simulator. Pick a real place or upload your own photo, fly over it in continuously generated live video, steer it and change the situation in real time, then land and explore on foot with an AI guide.

Built at Build Day with Live Models (Visko × Google Cloud × Reactor) on:

- **Visko Orbis**, a real-time video world model, hosted by **Reactor** and streamed over WebRTC
- **Google Gemini** for command understanding, guide narration, photo recognition and seed images
- **Next.js** and React

> **Status:** built in one day. See [instructions/phases/](instructions/phases/) for what has and has not been verified against a live Orbis session.

## How it works

Orbis is steered by text prompts only, and a new prompt lands at the next chunk boundary, about every 1.8 seconds. StratoFalcon is built around that:

1. **State over strings.** The browser holds one structured simulation state (bank, pitch, speed, altitude, weather, time of day, one-shot events). A pure function compiles state changes into single-action prompts.
2. **Deterministic fast path.** Keyboard and situation buttons never wait on a language model. Gemini is only in the loop for typed and spoken commands, guide narration and photo preparation.
3. **Instant local feedback.** The HUD and a small roll on the video react on the same frame as the key press, while the stream follows a moment later.
4. **One steer per chunk.** A scheduler sends at most one compiled prompt per chunk boundary and shows each one in the mission log as pending, then applied.
5. **Landing is a restart.** Orbis only takes a start image before a run begins, so landing resets the stream and restarts it from a street-level image of the same place.

```text
 keys / situation buttons ─► state change (instant)
 text / voice ─► /api/sim/command (Gemini → JSON state change) ─┐
                                                                ▼
                                          simulation state (browser)
                              ┌─────────────────────────────────┤
                              ▼                                 ▼
                    HUD, horizon, mission log          steer scheduler ─► Orbis
```

## Run locally

Requires Node.js 20.9 or newer, pnpm, a Reactor API key with access to Visko Orbis, and a Gemini API key.

```bash
cp .env.example .env.local
```

Add your keys to `.env.local`, then:

```bash
pnpm install
```

```bash
pnpm dev
```

Open <http://localhost:3000> in **Chrome** (voice commands use Chrome's speech recognition). The landing page is at `/`; **Try out the demo!** takes you to the simulator at `/demo`.

| Variable | Purpose |
| --- | --- |
| `REACTOR_API_KEY` | Server only. Mints short-lived session tokens |
| `GEMINI_API_KEY` | Server only |
| `NEXT_PUBLIC_ORBIS_MODEL` | Optional. `reactor/visko-orbis-dynamic` (default) or `reactor/visko-orbis-stable`. Restart the dev server after changing it |
| `DEMO_ACCESS_CODE` | Optional locally, required on a public deployment. When set, `/api/token` refuses requests without it |

A live session is billed per second by Reactor while it is connected. End the flight when you are not using it.

`pnpm dev` wraps Next.js with a session-cleanup script: sessions opened in development are recorded in the gitignored `.reactor-dev-sessions.json` and deleted on startup and shutdown.

### Try it without spending credits

Open <http://localhost:3000/demo?dry=1>. The flight deck, controls, HUD, scheduler and mission log all run, but nothing connects to Reactor: prompts are logged instead of sent.

## Controls

| Flight | | Tour | |
| --- | --- | --- | --- |
| `W` / `S` | Climb / descend | `W` / `S` | Walk / stop |
| `A` / `D` | Bank left / right | `A` / `D` | Turn left / right |
| `Space` | Level out | `Q` | Look up |
| `R` / `F` | Faster / slower | `T` | Take off |
| `L` | Land | | |

Controls are latched: press once to start, press the same key again to return to neutral. Situation buttons change weather, time of day and trigger one-shot events. The command box and the hold-to-talk button (or hold `V`) accept plain language such as "make it sunset" or "take us lower over the water".

## Project layout

| Path | What it holds |
| --- | --- |
| `lib/sim/types.ts` | Shared contract: simulation state and API shapes |
| `lib/sim/prompt-compiler.ts` | State to Orbis prompts |
| `lib/sim/destinations.ts`, `public/destinations/` | The six presets and their seed images |
| `app/api/sim/` | `command`, `guide`, `kickoff` and `seed` routes (Gemini) |
| `app/api/token/` | Reactor session token exchange |
| `components/`, `hooks/` | Gallery, flight deck, HUD, mission log, scheduler, session handling |
| `components/landing-page.tsx`, `app/landing.css` | Landing page at `/` with GSAP scroll animations; the simulator lives at `/demo` |
| `scripts/generate-seeds.mjs` | Regenerates preset seed images |
| `tests/` | Vitest suites (`pnpm test`) |
| `app/starter/` | The original Orbis starter UI, kept at `/starter` for debugging |
| `instructions/` | Master plan, commit playbook and per-phase notes |

To replace a preset image, drop a 16:9 PNG over `public/destinations/<id>/aerial.png` or `ground.png`.

## Checks

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm build
```

## References

- [Reactor documentation](https://docs.reactor.inc/overview)
- [Gemini image generation and editing](https://ai.google.dev/gemini-api/docs/image-generation)
