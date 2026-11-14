/**
 * Destination manifest tests, written from the contract (lib/sim/types.ts) and
 * the Phase 1 lane in the master doc.
 *
 * Readings chosen where the spec is open:
 *  - "kickoff prompts under ~100 words" is tested as 100 words or fewer.
 *  - `audioPrompt` is optional in the contract, but the qa brief asks for every
 *    field to be non-empty, so a missing audioPrompt fails its own test.
 *  - "16:9" allows the 1344x768 frame (ratio 1.75) that the image model calls
 *    16:9; anything further than 3% from 16:9 fails.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DESTINATIONS } from "@/lib/sim/destinations";
import type { Destination } from "@/lib/sim/types";

const EXPECTED_IDS = [
  "paris",
  "tokyo",
  "los-angeles",
  "new-york-city",
  "boston",
  "venice-beach",
];

const PUBLIC_DIR = path.join(process.cwd(), "public");

const destinations: readonly Destination[] = DESTINATIONS;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function publicFile(publicPath: string): string {
  return path.join(PUBLIC_DIR, ...publicPath.split("/").filter(Boolean));
}

/** Width and height from a PNG, JPEG or WebP header, or undefined. */
function imageSize(
  buffer: Buffer,
): { width: number; height: number } | undefined {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length && buffer[offset] === 0xff) {
      const marker = buffer[offset + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    return undefined;
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
  }
  return undefined;
}

describe("destination manifest", () => {
  it("has exactly the six preset ids", () => {
    expect(destinations).toHaveLength(6);
    expect(destinations.map((d) => d.id).sort()).toEqual(
      [...EXPECTED_IDS].sort(),
    );
  });

  it("has unique ids and unique names", () => {
    expect(new Set(destinations.map((d) => d.id)).size).toBe(
      destinations.length,
    );
    expect(new Set(destinations.map((d) => d.name)).size).toBe(
      destinations.length,
    );
  });
});

describe.each(EXPECTED_IDS)("destination %s", (id) => {
  const found = destinations.find((d) => d.id === id);

  it("is in the manifest", () => {
    expect(found, `no destination with id ${id}`).toBeDefined();
  });

  // The remaining tests fail on the line above first when the id is missing.
  const destination = found as Destination;

  it("has a kebab-case id", () => {
    expect(destination.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it.each([
    "name",
    "tagline",
    "aerialImage",
    "groundImage",
    "aerialKickoff",
    "groundKickoff",
  ] as const)("has a non-empty %s", (field) => {
    expect(typeof destination[field]).toBe("string");
    expect(destination[field].trim().length).toBeGreaterThan(0);
  });

  it("has three to six non-empty guide facts with no repeats", () => {
    expect(Array.isArray(destination.guideFacts)).toBe(true);
    expect(destination.guideFacts.length).toBeGreaterThanOrEqual(3);
    expect(destination.guideFacts.length).toBeLessThanOrEqual(6);
    for (const fact of destination.guideFacts) {
      expect(typeof fact).toBe("string");
      expect(fact.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(destination.guideFacts).size).toBe(
      destination.guideFacts.length,
    );
  });

  it.each(["aerialImage", "groundImage"] as const)(
    "%s is a public path inside the destination's own folder",
    (field) => {
      expect(destination[field]).toMatch(
        new RegExp(`^/destinations/${id}/[^/]+\\.(png|jpe?g|webp)$`),
      );
    },
  );

  it.each(["aerialImage", "groundImage"] as const)(
    "%s points to a file that exists under public/",
    (field) => {
      const file = publicFile(destination[field]);
      expect(existsSync(file), `missing file: ${file}`).toBe(true);
    },
  );

  it.each(["aerialImage", "groundImage"] as const)(
    "%s is a 16:9 image",
    (field) => {
      const file = publicFile(destination[field]);
      expect(existsSync(file), `missing file: ${file}`).toBe(true);
      const size = imageSize(readFileSync(file));
      expect(size, `unreadable image header: ${file}`).toBeDefined();
      const ratio = size!.width / size!.height;
      expect(
        Math.abs(ratio - 16 / 9) / (16 / 9),
        `${file} is ${size!.width}x${size!.height}`,
      ).toBeLessThan(0.03);
    },
  );

  it("uses different aerial and ground images", () => {
    expect(destination.aerialImage).not.toBe(destination.groundImage);
  });

  it.each(["aerialKickoff", "groundKickoff"] as const)(
    "%s is 100 words or fewer",
    (field) => {
      expect(wordCount(destination[field])).toBeGreaterThan(8);
      expect(wordCount(destination[field])).toBeLessThanOrEqual(100);
    },
  );

  it("has different aerial and ground kickoff prompts", () => {
    expect(destination.aerialKickoff.trim()).not.toBe(
      destination.groundKickoff.trim(),
    );
  });

  it("has a non-empty audioPrompt", () => {
    expect(typeof destination.audioPrompt).toBe("string");
    expect((destination.audioPrompt ?? "").trim().length).toBeGreaterThan(0);
  });

  it("audioPrompt differs from both visual prompts", () => {
    const audio = (destination.audioPrompt ?? "").trim().toLowerCase();
    if (!audio) return; // Covered by the non-empty test above.
    for (const field of ["aerialKickoff", "groundKickoff"] as const) {
      const visual = destination[field].trim().toLowerCase();
      expect(audio).not.toBe(visual);
      expect(visual.includes(audio), `${field} contains audioPrompt`).toBe(
        false,
      );
      expect(audio.includes(visual), `audioPrompt contains ${field}`).toBe(
        false,
      );
    }
  });
});

describe("kickoff prompts across the manifest", () => {
  it("are all distinct", () => {
    const prompts = destinations.flatMap((d) => [
      d.aerialKickoff.trim(),
      d.groundKickoff.trim(),
    ]);
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});
