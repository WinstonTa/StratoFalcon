import { callSimGemini, geminiServerTiming } from "@/lib/server/sim-gemini";
import {
  collapseWhitespace,
  errorResponse,
  limitWords,
  okResponse,
  readFormData,
  readPlaceHint,
  readUploadedImage,
} from "@/lib/server/sim-http";
import { INITIAL_STATE, compileKickoff } from "@/lib/sim/prompt-compiler";
import {
  KICKOFF_RESPONSE_JSON_SCHEMA,
  KICKOFF_SYSTEM_INSTRUCTION,
  buildKickoffUserText,
} from "@/lib/sim/prompts/kickoff";
import type { KickoffResponse, SimMode } from "@/lib/sim/types";

const MAX_NAME_CHARS = 80;
const MAX_PROMPT_WORDS = 99;
const MAX_FACTS = 5;
const MAX_FACT_CHARS = 240;
const FALLBACK_NAME = "Uploaded scene";
/**
 * Reading a photo takes longer than the text-only routes: about 4-5 s was
 * observed for a 2 MB PNG, so the 4 s interactive deadline does not fit here.
 */
const ATTEMPT_TIMEOUTS_MS = [15_000, 15_000];
const STYLE_TAIL = "photorealistic, in one continuous shot.";

/** Folds a stand-alone style sentence into the sentence before it. */
function joinStyleTail(prompt: string): string {
  return prompt.replace(
    /[.!?]\s+photorealistic,? in one continuous shot\.?$/i,
    `, ${STYLE_TAIL}`,
  );
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse("GEMINI_API_KEY is not configured", 500);
  }

  const form = await readFormData(request);
  if (!form) {
    return errorResponse("Send multipart form data with image and mode", 400);
  }

  const modeField = form.get("mode");
  if (modeField !== "flight" && modeField !== "tour") {
    return errorResponse("mode must be flight or tour", 400);
  }
  const mode: SimMode = modeField;

  const image = await readUploadedImage(form);
  if (!image.ok) {
    return errorResponse(image.message, image.status);
  }

  const result = await callSimGemini({
    apiKey,
    systemInstruction: KICKOFF_SYSTEM_INSTRUCTION,
    userText: buildKickoffUserText(mode, readPlaceHint(form)),
    image: { mimeType: image.mimeType, data: image.buffer.toString("base64") },
    temperature: 0.2,
    maxOutputTokens: 700,
    attemptTimeoutsMs: ATTEMPT_TIMEOUTS_MS,
    responseJsonSchema: KICKOFF_RESPONSE_JSON_SCHEMA,
  });

  if (!result.text) {
    return result.timedOut
      ? errorResponse("Gemini took too long to read the image", 504)
      : errorResponse("Gemini could not read the image", 502);
  }

  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(result.text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("not an object");
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return errorResponse("Gemini returned a kickoff result that is not JSON", 502);
  }

  const name =
    (typeof parsed.name === "string" &&
      collapseWhitespace(parsed.name).slice(0, MAX_NAME_CHARS)) ||
    FALLBACK_NAME;

  // If the model wrote no usable prompt, fall back to the compiled kickoff
  // for this name so the flight can still start.
  const prompt =
    (typeof parsed.prompt === "string" &&
      joinStyleTail(limitWords(parsed.prompt, MAX_PROMPT_WORDS))) ||
    compileKickoff(name, { ...INITIAL_STATE, mode });

  const guideFacts = Array.isArray(parsed.guideFacts)
    ? parsed.guideFacts
        .filter((fact): fact is string => typeof fact === "string")
        .map((fact) => collapseWhitespace(fact).slice(0, MAX_FACT_CHARS))
        .filter(Boolean)
        .slice(0, MAX_FACTS)
    : [];

  return okResponse<KickoffResponse>(
    { name, prompt, guideFacts },
    { "Server-Timing": geminiServerTiming(result) },
  );
}
