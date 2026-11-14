/**
 * POST /api/token with the Reactor API stubbed. No network, no real key.
 *
 * Covers QA finding P0-1 (an upstream Reactor failure must not answer 401,
 * because the client reads 401 as "ask for the demo access code") and the
 * DEMO_ACCESS_CODE gate, which cannot be exercised against the dev server
 * because the variable is not set there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/token/route";
import { ORBIS_MODELS } from "@/lib/orbis";

const fetchMock = vi.fn();

function upstream(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
  });
}

function tokenRequest(headers?: Record<string, string>) {
  return new Request("http://localhost:3000/api/token", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("REACTOR_API_KEY", "test-key-not-real");
  vi.stubEnv("DEMO_ACCESS_CODE", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/token", () => {
  it("returns { jwt } with no-store when Reactor issues a token", async () => {
    fetchMock.mockResolvedValue(upstream(200, { jwt: "aaa.bbb.ccc" }));
    const response = await POST(tokenRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jwt: "aaa.bbb.ccc" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("asks Reactor for both Orbis models, one session and a 900 s cap", async () => {
    fetchMock.mockResolvedValue(upstream(200, { jwt: "aaa.bbb.ccc" }));
    await POST(tokenRequest());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.reactor.inc/tokens");
    const sent = JSON.parse(String(init.body)) as {
      authorization_details: {
        resources: { models: { match: string[] } };
        constraints: {
          max_sessions: number;
          max_session_duration_seconds: number;
        };
      }[];
    };
    const detail = sent.authorization_details[0];
    expect([...detail.resources.models.match].sort()).toEqual(
      [...ORBIS_MODELS].sort(),
    );
    expect(detail.constraints).toEqual({
      max_sessions: 1,
      max_session_duration_seconds: 900,
    });
  });

  it.each([401, 403, 429, 500])(
    "reports an upstream Reactor %i as 502, never 401",
    async (status) => {
      fetchMock.mockResolvedValue(upstream(status, "upstream said no"));
      const response = await POST(tokenRequest());
      expect(response.status).toBe(502);
      const body = (await response.json()) as { error?: string; jwt?: string };
      expect(typeof body.error).toBe("string");
      expect(body.jwt).toBeUndefined();
    },
  );

  it("answers 502 when Reactor replies 200 without a jwt", async () => {
    fetchMock.mockResolvedValue(upstream(200, {}));
    const response = await POST(tokenRequest());
    expect(response.status).toBe(502);
  });

  it("answers 500 and does not call Reactor when the API key is missing", async () => {
    vi.stubEnv("REACTOR_API_KEY", "");
    const response = await POST(tokenRequest());
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never echoes the API key in an error body", async () => {
    fetchMock.mockResolvedValue(upstream(401, "bad key"));
    const response = await POST(tokenRequest());
    expect(await response.text()).not.toContain("test-key-not-real");
  });
});

describe("POST /api/token with DEMO_ACCESS_CODE set", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_ACCESS_CODE", "falcon-123");
    fetchMock.mockResolvedValue(upstream(200, { jwt: "aaa.bbb.ccc" }));
  });

  it("refuses a request without the code with 401 and does not call Reactor", async () => {
    const response = await POST(tokenRequest());
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each(["wrong", "falcon-12", "falcon-1234", "FALCON-123"])(
    "refuses the wrong code %j with 401",
    async (code) => {
      const response = await POST(tokenRequest({ "x-demo-code": code }));
      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("issues a token for the right code, ignoring surrounding spaces", async () => {
    const response = await POST(
      tokenRequest({ "x-demo-code": " falcon-123 " }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jwt: "aaa.bbb.ccc" });
  });

  it("still reports an upstream 401 as 502 when the code was right", async () => {
    fetchMock.mockResolvedValue(upstream(401, "bad key"));
    const response = await POST(tokenRequest({ "x-demo-code": "falcon-123" }));
    expect(response.status).toBe(502);
  });
});
