export const ORBIS_MODELS = [
  "reactor/visko-orbis-dynamic",
  "reactor/visko-orbis-stable",
] as const;

export type OrbisModelName = (typeof ORBIS_MODELS)[number];

export const DEFAULT_ORBIS_MODEL: OrbisModelName = "reactor/visko-orbis-dynamic";

export function isOrbisModel(value: unknown): value is OrbisModelName {
  return (
    typeof value === "string" &&
    (ORBIS_MODELS as readonly string[]).includes(value)
  );
}

// NEXT_PUBLIC_ORBIS_MODEL is inlined at build time, so changing it needs a
// dev-server restart. The token route authorizes both models either way.
const configuredModel = process.env.NEXT_PUBLIC_ORBIS_MODEL;

export const ORBIS_MODEL_NAME: OrbisModelName = isOrbisModel(configuredModel)
  ? configuredModel
  : DEFAULT_ORBIS_MODEL;

export const ORBIS_TRACKS = [
  { name: "main_video", kind: "video", direction: "recvonly" },
  { name: "main_audio", kind: "audio", direction: "recvonly" },
] as const;

export const DOCUMENTED_RESOLUTIONS = ["1080p", "2k", "4k"];

export type OrbisMessage = {
  type?: string;
  command?: string;
  reason?: string;
  available_resolutions?: string[];
  width?: number;
  height?: number;
  has_image?: boolean;
  has_prompt?: boolean;
  image_conditioned?: boolean;
  started?: boolean;
  running?: boolean;
  paused?: boolean;
  // chunk_complete
  chunk_index?: number;
  frames_emitted?: number;
  /** Dynamic only: the prompt that drove this chunk. */
  active_prompt?: string | null;
  // generation_started
  max_chunks?: number;
  frames_per_chunk?: number;
  fps?: number;
  // generation_complete
  total_chunks?: number;
  // prompt_accepted
  prompt?: string;
  // state
  current_chunk?: number;
  /** Dynamic only: the prompt currently driving generation. */
  current_prompt?: string | null;
};

export function unwrapOrbisMessage(raw: unknown): OrbisMessage {
  const envelope = raw as { type?: string; data?: Record<string, unknown> };
  if (envelope?.data && typeof envelope.data === "object") {
    return { ...envelope.data, type: envelope.type } as OrbisMessage;
  }
  return raw as OrbisMessage;
}

const DEMO_CODE_STORAGE_KEY = "stratofalcon-demo-code";
export const DEMO_CODE_HEADER = "x-demo-code";

export function readStoredDemoCode() {
  try {
    return window.localStorage.getItem(DEMO_CODE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeDemoCode(code: string) {
  try {
    window.localStorage.setItem(DEMO_CODE_STORAGE_KEY, code);
  } catch {
    // Private windows may block storage; the code still works for this request.
  }
}

// One prompt at a time, shared by every request that hits a 401 together, and
// no second prompt in this page load once the visitor has dismissed one (the
// guide polls every 20 s and must not nag).
let codePrompt: Promise<string> | null = null;
let promptDismissed = false;

function askForDemoCode(): Promise<string> {
  if (promptDismissed) return Promise.resolve("");
  codePrompt ??= new Promise<string>((resolve) => {
    const entered = window.prompt("Enter the demo access code")?.trim() ?? "";
    if (!entered) promptDismissed = true;
    resolve(entered);
  }).finally(() => {
    codePrompt = null;
  });
  return codePrompt;
}

/**
 * `fetch` for this app's own API routes. When the deployment sets
 * DEMO_ACCESS_CODE the routes answer 401 without the code: the stored code is
 * sent on every request, and on a 401 the visitor is asked for it once, the
 * request is retried, and a code that works is remembered in this browser.
 * The body must be re-sendable (a string or FormData, not a stream).
 */
export async function fetchWithDemoCode(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = (code: string) => {
    const headers = new Headers(init.headers);
    if (code) headers.set(DEMO_CODE_HEADER, code);
    return fetch(input, { ...init, headers });
  };

  const stored = readStoredDemoCode();
  let response = await send(stored);
  if (response.status !== 401) return response;

  // Another request may have just stored a working code.
  const latest = readStoredDemoCode();
  const code = latest && latest !== stored ? latest : await askForDemoCode();
  if (!code) return response;

  response = await send(code);
  if (response.status !== 401) storeDemoCode(code);
  return response;
}

/**
 * Requests a session-scoped Reactor JWT. When the deployment sets
 * DEMO_ACCESS_CODE, the route answers 401 and the visitor is asked for the
 * code once; it is then remembered in this browser.
 */
export async function requestReactorJwt() {
  const response = await fetchWithDemoCode("/api/token", { method: "POST" });
  const result = (await response.json().catch(() => ({}))) as {
    jwt?: string;
    error?: string;
  };

  if (response.status === 401) {
    throw new Error(result.error || "A demo access code is required.");
  }
  if (!response.ok || !result.jwt) {
    throw new Error(result.error || "Could not create a Reactor token");
  }
  return result.jwt;
}
