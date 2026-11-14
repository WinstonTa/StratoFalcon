import { callSimGemini, geminiServerTiming } from "@/lib/server/sim-gemini";
import {
  collapseWhitespace,
  errorResponse,
  limitWords,
  okResponse,
  parseSimState,
  readJsonObject,
} from "@/lib/server/sim-http";
import {
  GUIDE_MAX_WORDS,
  GUIDE_SYSTEM_INSTRUCTION,
  buildGuideUserText,
} from "@/lib/sim/prompts/guide";
import type { GuideResponse } from "@/lib/sim/types";

const MAX_DESTINATION_CHARS = 120;
const MAX_FACTS = 8;
const MAX_RECENT = 8;
const MAX_ITEM_CHARS = 300;

export const runtime = "nodejs";
export const maxDuration = 30;

/** Returns cleaned strings, or undefined when the value is not a string array. */
function stringList(raw: unknown, maxItems: number): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (!raw.every((item) => typeof item === "string")) return undefined;
  return (raw as string[])
    .map((item) => collapseWhitespace(item).slice(0, MAX_ITEM_CHARS))
    .filter(Boolean)
    .slice(0, maxItems);
}

/** Strips wrapping quotes, labels and line breaks the model may add. */
function cleanLine(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  return collapseWhitespace(firstLine)
    .replace(/^(guide|line|narrator)\s*:\s*/i, "")
    .replace(/^["'“‘*_\s]+|["'”’*_\s]+$/g, "");
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse("GEMINI_API_KEY is not configured", 500);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse(
      "Send a JSON body with destinationName, guideFacts, state and recent",
      400,
    );
  }

  const destinationName =
    typeof body.destinationName === "string"
      ? collapseWhitespace(body.destinationName).slice(0, MAX_DESTINATION_CHARS)
      : "";
  if (!destinationName) {
    return errorResponse("A destinationName is required", 400);
  }

  const guideFacts = stringList(body.guideFacts, MAX_FACTS);
  if (!guideFacts) {
    return errorResponse("guideFacts must be an array of strings", 400);
  }

  const recent = stringList(body.recent ?? [], MAX_RECENT);
  if (!recent) {
    return errorResponse("recent must be an array of strings", 400);
  }

  const state = parseSimState(body.state);
  if (!state) {
    return errorResponse("A valid state with mode flight or tour is required", 400);
  }

  const result = await callSimGemini({
    apiKey,
    systemInstruction: GUIDE_SYSTEM_INSTRUCTION,
    userText: buildGuideUserText({ destinationName, guideFacts, state, recent }),
    temperature: 0.7,
    maxOutputTokens: 120,
  });

  const line = limitWords(cleanLine(result.text), GUIDE_MAX_WORDS);
  if (!line) {
    return result.timedOut
      ? errorResponse("Gemini took too long to write a guide line", 504)
      : errorResponse("Gemini returned no guide line", 502);
  }

  return okResponse<GuideResponse>(
    { line },
    { "Server-Timing": geminiServerTiming(result) },
  );
}
