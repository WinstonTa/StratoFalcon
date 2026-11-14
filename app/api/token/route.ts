import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { ORBIS_MODELS } from "@/lib/orbis";

export const runtime = "nodejs";

const REACTOR_API_URL = "https://api.reactor.inc";

// A full fly-land-tour journey needs more than the starter's five minutes.
// Orbis Dynamic stops a single run at about seven minutes regardless.
const MAX_SESSION_DURATION_SECONDS = 900;

function codesMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY is not configured" },
      { status: 500 },
    );
  }

  // Optional gate for public deployments: without it, anyone with the URL can
  // spend Reactor credits. Unset locally, required on Vercel.
  const accessCode = process.env.DEMO_ACCESS_CODE?.trim();
  if (accessCode) {
    const provided = request.headers.get("x-demo-code")?.trim() ?? "";
    if (!provided || !codesMatch(provided, accessCode)) {
      return NextResponse.json(
        { error: "A valid demo access code is required" },
        { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
  }

  const response = await fetch(`${REACTOR_API_URL}/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Reactor-API-Key": apiKey,
    },
    body: JSON.stringify({
      expires_after: 3600,
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: [...ORBIS_MODELS] } },
          constraints: {
            max_sessions: 1,
            max_session_duration_seconds: MAX_SESSION_DURATION_SECONDS,
          },
        },
      ],
    }),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    // Always 502: only this route's own access-code gate may answer 401, or
    // the client would ask for a demo code when the Reactor key is at fault.
    return NextResponse.json(
      { error: `Reactor token request failed (${response.status}): ${text}` },
      { status: 502 },
    );
  }

  const result = JSON.parse(text) as { jwt?: string };
  if (!result.jwt) {
    return NextResponse.json({ error: "Reactor returned no JWT" }, { status: 502 });
  }

  return NextResponse.json(
    { jwt: result.jwt },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
