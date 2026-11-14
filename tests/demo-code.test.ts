/**
 * fetchWithDemoCode (lib/orbis.ts) with `window` and `fetch` stubbed: the
 * client side of the demo-access gate. No network.
 *
 * The module keeps prompt state at module level, so each test imports a fresh
 * copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RIGHT = "falcon-123";

type Fetcher = typeof import("@/lib/orbis").fetchWithDemoCode;

let storage: Map<string, string>;
let promptMock: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let fetchWithDemoCode: Fetcher;

/** A gated route: 401 unless the right code is in the header. */
function gatedRoute(delayMs = 0) {
  return async (_input: string, init?: RequestInit) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const code = new Headers(init?.headers).get("x-demo-code");
    return code === RIGHT
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify({ error: "code required" }), { status: 401 });
  };
}

beforeEach(async () => {
  vi.resetModules();
  storage = new Map();
  promptMock = vi.fn(() => RIGHT);
  fetchMock = vi.fn(gatedRoute());
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
    prompt: promptMock,
  });
  ({ fetchWithDemoCode } = await import("@/lib/orbis"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchWithDemoCode", () => {
  it("does not prompt or retry when the route is open", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    const response = await fetchWithDemoCode("/api/sim/guide", { method: "POST" });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(promptMock).not.toHaveBeenCalled();
  });

  it("prompts once on a 401, retries with the code and remembers it", async () => {
    const response = await fetchWithDemoCode("/api/sim/guide", { method: "POST" });
    expect(response.status).toBe(200);
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect([...storage.values()]).toEqual([RIGHT]);

    // The next request sends the stored code and needs no prompt.
    const again = await fetchWithDemoCode("/api/sim/command", { method: "POST" });
    expect(again.status).toBe(200);
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends at most two requests per call when the code keeps being wrong", async () => {
    promptMock.mockReturnValue("wrong");
    const response = await fetchWithDemoCode("/api/sim/guide", { method: "POST" });
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(storage.size).toBe(0);
  });

  it("stops asking for the rest of the page load once the prompt is dismissed", async () => {
    promptMock.mockReturnValue(null);
    expect((await fetchWithDemoCode("/api/sim/guide", { method: "POST" })).status).toBe(401);
    expect((await fetchWithDemoCode("/api/sim/guide", { method: "POST" })).status).toBe(401);
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-sends an intact FormData body on the retry", async () => {
    const bodies: { size: number; mode: unknown }[] = [];
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      const image = form.get("image") as File;
      bodies.push({
        size: (await image.arrayBuffer()).byteLength,
        mode: form.get("mode"),
      });
      return gatedRoute()(input, init);
    });
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(2048)], { type: "image/jpeg" }), "photo.jpg");
    form.append("mode", "flight");

    const response = await fetchWithDemoCode("/api/sim/kickoff", {
      method: "POST",
      body: form,
    });
    expect(response.status).toBe(200);
    expect(bodies).toEqual([
      { size: 2048, mode: "flight" },
      { size: 2048, mode: "flight" },
    ]);
  });

  it("asks once when a second 401 arrives while the first retry is still on its way", async () => {
    // In a browser window.prompt blocks, so a 401 for a second request is
    // handled only after the first prompt has been answered, and before the
    // first retry has come back and stored the code.
    vi.useFakeTimers();
    let call = 0;
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      call += 1;
      // 1: first request, immediate 401. 2: second request, 401 after 10 ms.
      // 3: first retry, back after 50 ms. Later calls: immediate.
      const delay = call === 2 ? 10 : call === 3 ? 50 : 0;
      return gatedRoute(delay)(input, init);
    });

    const first = fetchWithDemoCode("/api/sim/guide", { method: "POST" });
    const second = fetchWithDemoCode("/api/sim/command", { method: "POST" });
    await vi.advanceTimersByTimeAsync(500);
    const responses = await Promise.all([first, second]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(promptMock).toHaveBeenCalledTimes(1);
  });
});
