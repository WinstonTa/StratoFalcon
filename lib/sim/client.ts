/**
 * Browser-side wrappers for the simulation routes (app/api/sim/**). Every
 * route answers `{ error }` with a non-2xx status on failure; these wrappers
 * turn that into a thrown Error with a readable message.
 */

import type {
  ApiError,
  CommandRequest,
  CommandResponse,
  GuideRequest,
  GuideResponse,
  KickoffResponse,
  SeedView,
  SimMode,
} from "@/lib/sim/types";

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  const reason = body?.error?.trim();
  return new Error(reason || `${fallback} (HTTP ${response.status})`);
}

async function postJson<T>(
  url: string,
  body: unknown,
  fallback: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await readError(response, fallback);
  return (await response.json()) as T;
}

/** Free text or a voice transcript to a state change plus a short reply. */
export function requestCommand(body: CommandRequest, signal?: AbortSignal) {
  return postJson<CommandResponse>(
    "/api/sim/command",
    body,
    "The co-pilot did not answer",
    signal,
  );
}

/** One line of guide narration. `recent` is newest first. */
export function requestGuideLine(body: GuideRequest, signal?: AbortSignal) {
  return postJson<GuideResponse>(
    "/api/sim/guide",
    body,
    "The guide did not answer",
    signal,
  );
}

function imageForm(image: Blob, fields: Record<string, string | undefined>) {
  const form = new FormData();
  const extension = image.type === "image/png" ? "png" : "jpg";
  form.append("image", image, `photo.${extension}`);
  for (const [key, value] of Object.entries(fields)) {
    if (value) form.append(key, value);
  }
  return form;
}

/** Uploaded photo to a place name, a kickoff prompt and guide facts. */
export async function requestKickoff(
  image: Blob,
  mode: SimMode,
  placeHint?: string,
): Promise<KickoffResponse> {
  const response = await fetch("/api/sim/kickoff", {
    method: "POST",
    body: imageForm(image, { mode, placeHint }),
  });
  if (!response.ok) {
    throw await readError(response, "Could not recognise the photo");
  }
  return (await response.json()) as KickoffResponse;
}

/** The same place seen from the other vantage point, as a 16:9 image. */
export async function requestSeed(
  image: Blob,
  view: SeedView,
  placeHint?: string,
): Promise<Blob> {
  const response = await fetch("/api/sim/seed", {
    method: "POST",
    body: imageForm(image, { view, placeHint }),
  });
  if (!response.ok) {
    throw await readError(response, "Could not prepare the seed image");
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("The seed route did not return an image");
  }
  return blob;
}
