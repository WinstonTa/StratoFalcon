/**
 * One bounded Gemini text call for the interactive sim routes. Server only.
 *
 * These routes sit on the live control path, so a stalled upstream call must
 * not hang the UI: each attempt has a deadline, and a timed-out or failed
 * first attempt is retried once.
 */

import { GoogleGenAI } from "@google/genai";

import { ORBIS_PROMPT_MODEL } from "@/lib/orbis-prompt";

import { safeText } from "./sim-http";

const ATTEMPT_TIMEOUTS_MS = [4_000, 6_000];

export interface SimGeminiRequest {
  apiKey: string;
  systemInstruction: string;
  userText: string;
  temperature: number;
  maxOutputTokens: number;
  /** Standard JSON Schema. When set, the reply is requested as JSON. */
  responseJsonSchema?: unknown;
}

export interface SimGeminiResult {
  /** Trimmed reply text; empty when every attempt failed or returned nothing. */
  text: string;
  /** Wall-clock time spent across all attempts. */
  elapsedMs: number;
  attempts: number;
  timedOut: boolean;
}

export async function callSimGemini(
  request: SimGeminiRequest,
): Promise<SimGeminiResult> {
  const ai = new GoogleGenAI({ apiKey: request.apiKey });
  const startedAt = Date.now();
  let attempts = 0;
  let timedOut = false;
  let text = "";

  for (const timeoutMs of ATTEMPT_TIMEOUTS_MS) {
    attempts += 1;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model: ORBIS_PROMPT_MODEL,
        contents: [{ text: request.userText }],
        config: {
          systemInstruction: request.systemInstruction,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 },
          abortSignal: signal,
          ...(request.responseJsonSchema
            ? {
                responseMimeType: "application/json",
                responseJsonSchema: request.responseJsonSchema,
              }
            : {}),
        },
      });
      text = safeText(response);
      timedOut = false;
      if (text) break;
    } catch (caught) {
      timedOut = signal.aborted;
      console.error(
        `Sim Gemini attempt ${attempts} ${timedOut ? `timed out after ${timeoutMs} ms` : "failed"}`,
        timedOut ? "" : caught,
      );
    }
  }

  return { text, elapsedMs: Date.now() - startedAt, attempts, timedOut };
}

/** `Server-Timing` value so callers can tell model time from server time. */
export function geminiServerTiming(result: SimGeminiResult): string {
  return `gemini;dur=${result.elapsedMs};desc="attempts=${result.attempts}"`;
}
