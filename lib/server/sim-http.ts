/**
 * Small shared helpers for the app/api/sim/** routes. Server only.
 */

import { NextResponse } from "next/server";

import { INITIAL_STATE, applyDelta } from "@/lib/sim/prompt-compiler";
import type { ApiError, SimState } from "@/lib/sim/types";

export const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export function errorResponse(message: string, status: number) {
  return NextResponse.json<ApiError>(
    { error: message },
    { status, headers: NO_STORE_HEADERS },
  );
}

export function okResponse<T>(body: T, extraHeaders?: Record<string, string>) {
  return NextResponse.json<T>(body, {
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

/** Parses a JSON object body. Returns undefined for anything else. */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON.
  }
  return undefined;
}

/**
 * Validates a client-supplied SimState. Requires an object with a valid
 * `mode`; every other field falls back to INITIAL_STATE when it is missing or
 * not a contract value.
 */
export function parseSimState(raw: unknown): SimState | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const mode = (raw as { mode?: unknown }).mode;
  if (mode !== "flight" && mode !== "tour") return undefined;
  return applyDelta({ ...INITIAL_STATE, mode, event: null }, raw);
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Cuts text to at most `maxWords` words, ending cleanly. */
export function limitWords(text: string, maxWords: number): string {
  const words = collapseWhitespace(text).split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ").replace(/[,;:.!?—-]+$/, "")}.`;
}

/** Reads `response.text` without throwing when Gemini returns no candidate. */
export function safeText(response: { text?: string | undefined }): string {
  try {
    return response.text?.trim() || "";
  } catch {
    return "";
  }
}
