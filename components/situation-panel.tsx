"use client";

import { useSimStore } from "@/lib/sim/store";
import type { Environment, SimMode } from "@/lib/sim/types";

const WEATHER: Environment["weather"][] = [
  "clear",
  "cloudy",
  "rain",
  "storm",
  "fog",
  "snow",
];

const TIMES: Environment["timeOfDay"][] = ["dawn", "day", "sunset", "night"];

interface Situation {
  id: string;
  label: string;
  /** One physical sentence, sent to Orbis as written. */
  prompt: string;
}

const SITUATIONS: Record<SimMode, Situation[]> = {
  flight: [
    {
      id: "turbulence",
      label: "Turbulence",
      prompt:
        "The aircraft shudders through turbulence, the view shaking and bouncing as strong gusts buffet the wings.",
    },
    {
      id: "birds",
      label: "Flock of birds",
      prompt:
        "A large flock of birds sweeps across the view just ahead of the aircraft, wings flashing in the light.",
    },
    {
      id: "fireworks",
      label: "Fireworks",
      prompt:
        "Fireworks burst in bright colors across the sky ahead, glittering trails falling toward the ground below.",
    },
    {
      id: "balloons",
      label: "Hot-air balloons",
      prompt:
        "Colorful hot-air balloons drift into view ahead, floating slowly at the same height as the aircraft.",
    },
    {
      id: "rainbow",
      label: "Rainbow",
      prompt:
        "A vivid rainbow arcs across the sky ahead, its bands of color glowing against the clouds.",
    },
  ],
  tour: [
    {
      id: "musicians",
      label: "Street musicians",
      prompt:
        "Street musicians begin playing on the pavement just ahead, and a small crowd gathers around them.",
    },
    {
      id: "festival",
      label: "Street festival",
      prompt:
        "A lively street festival fills the way ahead, with colorful banners overhead, food stalls and people dancing.",
    },
    {
      id: "pigeons",
      label: "Flock of pigeons",
      prompt:
        "A flock of pigeons bursts up from the ground just ahead and scatters into the air.",
    },
  ],
};

let eventSerial = 0;

/**
 * Situation buttons: weather, time of day and one-shot events. Like the
 * keyboard they only change local state; the steer scheduler does the rest.
 */
export function SituationPanel({ disabled }: { disabled: boolean }) {
  const mode = useSimStore((store) => store.state.mode);
  const environment = useSimStore((store) => store.state.environment);
  const activeEvent = useSimStore((store) => store.state.event);

  const press = (label: string, apply: () => void) => {
    useSimStore.getState().log("input", `Button · ${label}`);
    apply();
  };

  return (
    <div className="situations" aria-label="Situations">
      <div className="situation-group">
        <span className="situation-title">Weather</span>
        {WEATHER.map((weather) => (
          <button
            key={weather}
            type="button"
            className={`chip${environment.weather === weather ? " is-on" : ""}`}
            disabled={disabled}
            onClick={(event) => {
              event.currentTarget.blur();
              press(weather, () =>
                useSimStore.getState().applyDelta({ environment: { weather } }),
              );
            }}
          >
            {weather}
          </button>
        ))}
      </div>

      <div className="situation-group">
        <span className="situation-title">Time</span>
        {TIMES.map((timeOfDay) => (
          <button
            key={timeOfDay}
            type="button"
            className={`chip${environment.timeOfDay === timeOfDay ? " is-on" : ""}`}
            disabled={disabled}
            onClick={(event) => {
              event.currentTarget.blur();
              press(timeOfDay, () =>
                useSimStore
                  .getState()
                  .applyDelta({ environment: { timeOfDay } }),
              );
            }}
          >
            {timeOfDay}
          </button>
        ))}
      </div>

      <div className="situation-group">
        <span className="situation-title">Events</span>
        {SITUATIONS[mode].map((situation) => (
          <button
            key={situation.id}
            type="button"
            className={`chip chip-event${
              activeEvent?.id.startsWith(`${situation.id}-`) ? " is-on" : ""
            }`}
            disabled={disabled}
            onClick={(event) => {
              event.currentTarget.blur();
              press(situation.label, () => {
                // A fresh id per press, so the same event can fire again.
                eventSerial += 1;
                useSimStore.getState().applyDelta({
                  event: {
                    id: `${situation.id}-${Date.now()}-${eventSerial}`,
                    label: situation.label,
                    prompt: situation.prompt,
                  },
                });
              });
            }}
          >
            {situation.label}
          </button>
        ))}
      </div>
    </div>
  );
}
