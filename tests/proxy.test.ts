/**
 * proxy.ts: the demo-access gate in front of /api/sim/* (QA finding D-1).
 * The env var is stubbed and requests are built with NextRequest; no server.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "@/proxy";

function simRequest(headers?: Record<string, string>, path = "/api/sim/command") {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
  });
}

/** NextResponse.next() marks a pass-through with this header. */
function passedThrough(response: Response) {
  return (
    response.status === 200 &&
    response.headers.get("x-middleware-next") === "1"
  );
}

/** Turns the Next.js matcher pattern into a RegExp for the paths we care about. */
function matcherRegExp(): RegExp {
  const matcher = config.matcher;
  expect(typeof matcher).toBe("string");
  const source = String(matcher)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\/:path\\\*/, "(?:/.*)?")
    .replace(/\/:path\*/, "(?:/.*)?");
  return new RegExp(`^${source}$`);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy with DEMO_ACCESS_CODE unset", () => {
  it.each(["", "   "])("passes every request through (value %j)", (value) => {
    vi.stubEnv("DEMO_ACCESS_CODE", value);
    expect(passedThrough(proxy(simRequest()))).toBe(true);
    expect(passedThrough(proxy(simRequest({ "x-demo-code": "anything" })))).toBe(
      true,
    );
  });
});

describe("proxy with DEMO_ACCESS_CODE set", () => {
  const CODE = "falcon-123";

  it("answers 401 JSON { error } with no-store when the header is missing", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", CODE);
    const response = proxy(simRequest());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { error?: unknown };
    expect(typeof body.error).toBe("string");
    expect(Object.keys(body)).toEqual(["error"]);
  });

  it.each(["wrong", "falcon-12", "falcon-1234", "FALCON-123", " ", "falcon_123"])(
    "answers 401 for the wrong code %j",
    (code) => {
      vi.stubEnv("DEMO_ACCESS_CODE", CODE);
      const response = proxy(simRequest({ "x-demo-code": code }));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toContain("no-store");
    },
  );

  it("passes the right code through, ignoring surrounding spaces", () => {
    vi.stubEnv("DEMO_ACCESS_CODE", ` ${CODE} `);
    expect(passedThrough(proxy(simRequest({ "x-demo-code": CODE })))).toBe(true);
    expect(
      passedThrough(proxy(simRequest({ "x-demo-code": `  ${CODE} ` }))),
    ).toBe(true);
  });

  it.each([
    "/api/sim/command",
    "/api/sim/guide",
    "/api/sim/kickoff",
    "/api/sim/seed",
  ])("gates %s", (path) => {
    vi.stubEnv("DEMO_ACCESS_CODE", CODE);
    expect(proxy(simRequest(undefined, path)).status).toBe(401);
  });

  it("does not echo the expected code in the error body", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", CODE);
    const text = await proxy(simRequest({ "x-demo-code": "wrong" })).text();
    expect(text).not.toContain(CODE);
  });
});

describe("proxy matcher", () => {
  it("is exactly the /api/sim subtree", () => {
    expect(config.matcher).toBe("/api/sim/:path*");
  });

  it.each([
    "/api/sim",
    "/api/sim/command",
    "/api/sim/guide",
    "/api/sim/kickoff",
    "/api/sim/seed",
  ])("matches %s", (path) => {
    expect(matcherRegExp().test(path)).toBe(true);
  });

  it.each([
    "/",
    "/starter",
    "/api/token",
    "/api/session-cleanup",
    "/api/session-registry",
    "/api/nano-banana",
    "/api/orbis-prompt",
    "/api/simulate",
    "/destinations/paris/aerial.png",
    "/_next/static/chunk.js",
  ])("does not match %s", (path) => {
    expect(matcherRegExp().test(path)).toBe(false);
  });
});
