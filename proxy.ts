import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Public-deployment gate for the Gemini-backed simulation routes.
 *
 * When DEMO_ACCESS_CODE is set, /api/sim/* requires the same `x-demo-code`
 * header that /api/token checks for itself, so a visitor without the code can
 * spend neither Reactor nor Gemini credits. When it is unset (local
 * development) this does nothing.
 */

function codesMatch(provided: string, expected: string) {
  if (provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function proxy(request: NextRequest) {
  const accessCode = process.env.DEMO_ACCESS_CODE?.trim();
  if (!accessCode) return NextResponse.next();

  const provided = request.headers.get("x-demo-code")?.trim() ?? "";
  if (provided && codesMatch(provided, accessCode)) return NextResponse.next();

  return NextResponse.json(
    { error: "A valid demo access code is required" },
    { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const config = {
  matcher: "/api/sim/:path*",
};
