"use client";

import { type MissionLogEntry, useSimStore } from "@/lib/sim/store";

const KIND_LABEL: Record<MissionLogEntry["kind"], string> = {
  input: "Input",
  gemini: "Gemini",
  state: "State",
  prompt: "Prompt",
  guide: "Guide",
  system: "System",
};

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The judging HUD: every input, the state change it caused, and the exact
 * sentence sent to Orbis with a pending or applied marker. Newest first.
 */
export function MissionLog() {
  const missionLog = useSimStore((store) => store.missionLog);
  const state = useSimStore((store) => store.state);

  const startedAt = missionLog[0]?.time ?? 0;
  const prompts = missionLog.filter((entry) => entry.kind === "prompt");
  const pending = prompts.filter((entry) => entry.status === "pending").length;
  const entries = [...missionLog].reverse();

  // The structured state the prompts are compiled from, for the active mode.
  const readout: [label: string, value: string][] = [
    ...(state.mode === "tour"
      ? ([
          ["Mode", "tour"],
          ["Move", state.tour.move],
          ["Turn", state.tour.turn],
          ["Gaze", state.tour.gaze],
        ] as [string, string][])
      : ([
          ["Bank", state.flight.bank],
          ["Pitch", state.flight.pitch],
          ["Speed", state.flight.speed],
          ["Altitude", state.flight.altitude],
        ] as [string, string][])),
    ["Time", state.environment.timeOfDay],
    ["Weather", state.environment.weather],
  ];

  return (
    <aside className="log" aria-label="Mission log">
      <header className="log-head">
        <h2>Mission log</h2>
        <p>
          <span>{prompts.length} prompts</span>
          <span className={pending ? "log-pending-count" : ""}>
            {pending} pending
          </span>
        </p>
      </header>

      <dl className="log-readout" aria-label="Simulation state">
        {readout.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <ol className="log-list">
        {entries.map((entry) => (
          <li key={entry.id} className={`log-entry log-${entry.kind}`}>
            <div className="log-meta">
              <span className="log-kind">{KIND_LABEL[entry.kind]}</span>
              <time>T+{formatElapsed(entry.time - startedAt)}</time>
              {entry.status && (
                <span className={`log-status log-status-${entry.status}`}>
                  {entry.status === "pending" ? "Pending" : "Applied"}
                </span>
              )}
            </div>
            <p className="log-text">{entry.text}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
