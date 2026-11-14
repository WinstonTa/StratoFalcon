/**
 * Latched keyboard controls (hooks/use-flight-controls.ts) against the store,
 * without React. Covers the key map in master doc section 3.4: W/S pitch,
 * A/D bank, Space level out, R/F speed.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  FLIGHT_KEYS,
  applyFlightControl,
  isControlActive,
} from "@/hooks/use-flight-controls";
import { compileSteerQueue } from "@/lib/sim/prompt-compiler";
import { useSimStore } from "@/lib/sim/store";
import type { Destination } from "@/lib/sim/types";

const DESTINATION: Destination = {
  id: "test-place",
  name: "Test Place",
  tagline: "A place for tests",
  aerialImage: "/destinations/test-place/aerial.png",
  groundImage: "/destinations/test-place/ground.png",
  aerialKickoff: "An aerial view over a test place.",
  groundKickoff: "A street in a test place.",
  guideFacts: ["one", "two", "three"],
};

const store = () => useSimStore.getState();
const flight = () => store().state.flight;
const pending = () =>
  compileSteerQueue(store().lastSentState, store().state).length;

beforeEach(() => {
  store().reset();
  store().beginFlight(DESTINATION);
});

describe("key map", () => {
  it("binds the seven flight keys from the master doc", () => {
    const map = Object.fromEntries(
      FLIGHT_KEYS.map((key) => [key.code, key.control]),
    );
    expect(map).toEqual({
      KeyW: "climb",
      KeyS: "descend",
      KeyA: "bank-left",
      KeyD: "bank-right",
      Space: "level",
      KeyR: "faster",
      KeyF: "slower",
    });
  });
});

describe("latched controls", () => {
  it("W climbs and stays climbing; W again levels the pitch", () => {
    applyFlightControl("climb");
    expect(flight().pitch).toBe("climb");
    expect(isControlActive("climb", flight())).toBe(true);
    applyFlightControl("climb");
    expect(flight().pitch).toBe("level");
  });

  it("S descends, and W while descending switches straight to climb", () => {
    applyFlightControl("descend");
    expect(flight().pitch).toBe("descend");
    applyFlightControl("climb");
    expect(flight().pitch).toBe("climb");
  });

  it("A and D bank, and the opposite key switches sides", () => {
    applyFlightControl("bank-left");
    expect(flight().bank).toBe("left");
    applyFlightControl("bank-right");
    expect(flight().bank).toBe("right");
    applyFlightControl("bank-right");
    expect(flight().bank).toBe("level");
  });

  it("Space levels bank and pitch but keeps speed and altitude", () => {
    applyFlightControl("bank-left");
    applyFlightControl("climb");
    applyFlightControl("faster");
    applyFlightControl("level");
    expect(flight()).toEqual({
      bank: "level",
      pitch: "level",
      speed: "fast",
      altitude: "mid",
    });
    expect(isControlActive("level", flight())).toBe(true);
  });

  it("R and F step speed and stop at the ends", () => {
    applyFlightControl("faster");
    expect(flight().speed).toBe("fast");
    applyFlightControl("faster");
    expect(flight().speed).toBe("fast");
    applyFlightControl("slower");
    expect(flight().speed).toBe("cruise");
    applyFlightControl("slower");
    applyFlightControl("slower");
    expect(flight().speed).toBe("slow");
  });

  it("each press that changes state leaves exactly one more pending steer", () => {
    expect(pending()).toBe(0);
    applyFlightControl("bank-left");
    expect(pending()).toBe(1);
    applyFlightControl("climb");
    expect(pending()).toBe(2);
    applyFlightControl("faster");
    expect(pending()).toBe(3);
    applyFlightControl("level");
    expect(pending()).toBe(1);
  });

  it("logs every key press as an input entry", () => {
    const before = store().missionLog.length;
    applyFlightControl("bank-left", "A");
    const added = store().missionLog.slice(before);
    expect(added.map((entry) => entry.kind)).toEqual(["input", "state"]);
    expect(added[0].text).toContain("Bank left");
  });

  it("does nothing outside flight mode", () => {
    useSimStore.setState({ state: { ...store().state, mode: "tour" } });
    const before = JSON.stringify(store().state);
    applyFlightControl("bank-left");
    applyFlightControl("climb");
    expect(JSON.stringify(store().state)).toBe(before);
  });
});
