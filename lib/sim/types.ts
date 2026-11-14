/**
 * StratoFalcon shared simulation contract — v1.
 *
 * Architect-owned. Do not edit without asking the architect: frontend-dev,
 * backend-dev and qa-reviewer all code against these shapes. See
 * instructions/MASTER_INSTRUCTIONS.md section 3.
 *
 * Types only. No runtime code here, so this file is safe to import anywhere.
 */

export type SimMode = "flight" | "tour";

export type SimPhase =
  | "idle"
  | "preparing"
  | "flying"
  | "landing"
  | "touring"
  | "ended";

export interface FlightState {
  bank: "left" | "level" | "right";
  pitch: "climb" | "level" | "descend";
  speed: "slow" | "cruise" | "fast";
  altitude: "low" | "mid" | "high";
}

export interface TourState {
  move: "stand" | "walk";
  turn: "none" | "left" | "right";
  gaze: "ahead" | "up";
}

export interface Environment {
  timeOfDay: "dawn" | "day" | "sunset" | "night";
  weather: "clear" | "cloudy" | "rain" | "storm" | "fog" | "snow";
}

/**
 * A one-shot situation such as turbulence or fireworks. `prompt` is a single
 * physical sentence that can be sent to Orbis as-is. The steer scheduler
 * clears the event from state once it has been sent.
 */
export interface SimEvent {
  id: string;
  label: string;
  prompt: string;
}

export interface SimState {
  mode: SimMode;
  flight: FlightState;
  tour: TourState;
  environment: Environment;
  event: SimEvent | null;
}

/** A partial change to SimState. Omitted keys are left as they are. */
export interface SimStateDelta {
  flight?: Partial<FlightState>;
  tour?: Partial<TourState>;
  environment?: Partial<Environment>;
  event?: SimEvent | null;
}

export interface Destination {
  /** kebab-case; also the folder name under public/destinations/. */
  id: string;
  name: string;
  tagline: string;
  /** Public URL path to a 16:9 aerial seed image. */
  aerialImage: string;
  /** Public URL path to a 16:9 street-level seed image. */
  groundImage: string;
  /** Full first prompt for flight: who, what, where and camera. */
  aerialKickoff: string;
  /** Full first prompt for the tour: who, what, where and camera. */
  groundKickoff: string;
  /** Ambient sound only. Never reuse the visual prompt here. */
  audioPrompt?: string;
  /** Three to six short, true facts the guide may draw on. */
  guideFacts: string[];
}

// ---------------------------------------------------------------------------
// API shapes (app/api/sim/**). Every route returns ApiError with a non-2xx
// status on failure.
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
}

/** POST /api/sim/command — free text or a voice transcript to a state change. */
export interface CommandRequest {
  text: string;
  state: SimState;
  destinationName: string;
}

export interface CommandResponse {
  delta: SimStateDelta;
  /** Co-pilot acknowledgement, 12 words or fewer. */
  say: string;
}

/** POST /api/sim/guide — one line of narration. */
export interface GuideRequest {
  destinationName: string;
  guideFacts: string[];
  state: SimState;
  /** Lines already spoken, newest first, so the guide does not repeat itself. */
  recent: string[];
}

export interface GuideResponse {
  /** 25 words or fewer. */
  line: string;
}

/**
 * POST /api/sim/kickoff — multipart form: `image` (file), `mode` (SimMode),
 * optional `placeHint` (string). Used for uploaded photos.
 */
export interface KickoffResponse {
  name: string;
  prompt: string;
  guideFacts: string[];
}

/**
 * POST /api/sim/seed — multipart form: `image` (file), `view` (SeedView),
 * optional `placeHint` (string). Responds with image bytes, 16:9.
 */
export type SeedView = "aerial" | "ground";
