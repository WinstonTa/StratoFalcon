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

export const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;

/** Image types both Gemini text and image models accept inline. */
const UPLOAD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type UploadedImage =
  | { ok: true; mimeType: string; buffer: Buffer }
  | { ok: false; message: string; status: number };

/** Parses multipart form data. Returns undefined when the body is not a form. */
export async function readFormData(
  request: Request,
): Promise<FormData | undefined> {
  try {
    return await request.formData();
  } catch {
    return undefined;
  }
}

/** Validates the `image` field of an upload form: present, a supported type, 10 MB or smaller. */
export async function readUploadedImage(form: FormData): Promise<UploadedImage> {
  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, message: "An image file is required", status: 400 };
  }
  if (!UPLOAD_IMAGE_TYPES.includes(image.type)) {
    return {
      ok: false,
      message: "The image must be a PNG, JPEG or WebP file",
      status: 400,
    };
  }
  if (image.size > MAX_UPLOAD_IMAGE_BYTES) {
    return { ok: false, message: "The image must be 10 MB or smaller", status: 413 };
  }
  return {
    ok: true,
    mimeType: image.type,
    buffer: Buffer.from(await image.arrayBuffer()),
  };
}

/** Optional free-text hint about the place, trimmed and capped. */
export function readPlaceHint(form: FormData): string {
  const hint = form.get("placeHint");
  return typeof hint === "string" ? collapseWhitespace(hint).slice(0, 120) : "";
}
