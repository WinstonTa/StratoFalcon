import { callSimGemini, geminiServerTiming } from "@/lib/server/sim-gemini";
import {
  collapseWhitespace,
  errorResponse,
  limitWords,
  okResponse,
  parseSimState,
  readJsonObject,
} from "@/lib/server/sim-http";
import { sanitizeDelta } from "@/lib/sim/prompt-compiler";
import {
  COMMAND_RESPONSE_JSON_SCHEMA,
  COMMAND_SYSTEM_INSTRUCTION,
  buildCommandUserText,
} from "@/lib/sim/prompts/command";
import type {
  CommandResponse,
  SimState,
  SimStateDelta,
} from "@/lib/sim/types";

const MAX_TEXT_CHARS = 500;
const MAX_DESTINATION_CHARS = 120;
const MAX_SAY_WORDS = 12;
const FALLBACK_SAY = "Copy that.";

export const runtime = "nodejs";
export const maxDuration = 30;

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "event"
  );
}

/**
 * Reduces raw model output to a delta the client can apply as-is: contract
 * keys and enum values only, only the current mode's controls, no fields that
 * already hold the requested value, and an event with a fresh server-made id.
 */
function toDelta(raw: unknown, state: SimState): SimStateDelta {
  const clean = sanitizeDelta(raw);
  const delta: SimStateDelta = {};

  if (state.mode === "flight" && clean.flight) {
    const changed = Object.fromEntries(
      Object.entries(clean.flight).filter(
        ([key, value]) => state.flight[key as keyof SimState["flight"]] !== value,
      ),
    );
    if (Object.keys(changed).length > 0) delta.flight = changed;
  }
  if (state.mode === "tour" && clean.tour) {
    const changed = Object.fromEntries(
      Object.entries(clean.tour).filter(
        ([key, value]) => state.tour[key as keyof SimState["tour"]] !== value,
      ),
    );
    if (Object.keys(changed).length > 0) delta.tour = changed;
  }
  if (clean.environment) {
    const changed = Object.fromEntries(
      Object.entries(clean.environment).filter(
        ([key, value]) =>
          state.environment[key as keyof SimState["environment"]] !== value,
      ),
    );
    if (Object.keys(changed).length > 0) delta.environment = changed;
  }
  // The model never clears an event; a null or unusable event is "no event".
  if (clean.event) {
    delta.event = {
      id: `evt-${slug(clean.event.label)}-${Date.now().toString(36)}`,
      label: clean.event.label,
      prompt: clean.event.prompt,
    };
  }
  return delta;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse("GEMINI_API_KEY is not configured", 500);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Send a JSON body with text, state and destinationName", 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return errorResponse("A command text is required", 400);
  }
  if (text.length > MAX_TEXT_CHARS) {
    return errorResponse(
      `The command must be ${MAX_TEXT_CHARS} characters or fewer`,
      400,
    );
  }

  const state = parseSimState(body.state);
  if (!state) {
    return errorResponse("A valid state with mode flight or tour is required", 400);
  }

  const destinationName =
    typeof body.destinationName === "string"
      ? collapseWhitespace(body.destinationName).slice(0, MAX_DESTINATION_CHARS)
      : "";

  const result = await callSimGemini({
    apiKey,
    systemInstruction: COMMAND_SYSTEM_INSTRUCTION,
    userText: buildCommandUserText({
      text,
      mode: state.mode,
      stateJson: JSON.stringify({
        ...(state.mode === "flight"
          ? { flight: state.flight }
          : { tour: state.tour }),
        environment: state.environment,
      }),
      destinationName,
    }),
    temperature: 0.1,
    maxOutputTokens: 400,
    responseJsonSchema: COMMAND_RESPONSE_JSON_SCHEMA,
  });

  if (!result.text) {
    return result.timedOut
      ? errorResponse("Gemini took too long to interpret the command", 504)
      : errorResponse("Gemini could not interpret the command", 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return errorResponse("Gemini returned a command result that is not JSON", 502);
  }

  const rawSay =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { say?: unknown }).say
      : undefined;
  const say =
    (typeof rawSay === "string" && limitWords(rawSay, MAX_SAY_WORDS)) ||
    FALLBACK_SAY;

  return okResponse<CommandResponse>(
    { delta: toDelta(parsed, state), say },
    { "Server-Timing": geminiServerTiming(result) },
  );
}
