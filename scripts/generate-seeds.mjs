// Generates the preset seed images for StratoFalcon with Nano Banana.
//
//   node scripts/generate-seeds.mjs                 all missing images
//   node scripts/generate-seeds.mjs paris tokyo     only these destinations
//   node scripts/generate-seeds.mjs paris/ground    only one image
//   node scripts/generate-seeds.mjs --force boston  regenerate even if present
//
// Writes public/destinations/<id>/aerial.<ext> and ground.<ext>, where <ext>
// follows the mime type the model returns. Existing files are skipped unless
// --force is given. Needs GEMINI_API_KEY in .env.local (never printed).
//
// The model's "16:9" output is 1344x768 (ratio 1.75). When `sharp` can be
// loaded (Next.js installs it), every target image, new or existing, is
// center-cropped to an exact 16:9 frame. Without sharp the file is left as it
// is and the log line says "NOT exact 16:9".
//
// Keep the ids and file names in step with lib/sim/destinations.ts.

import { promises as fs } from "node:fs";
import path from "node:path";

import { GoogleGenAI } from "@google/genai";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const projectDirectory = process.cwd();
loadEnvConfig(projectDirectory, false, { info: () => {}, error: console.error });

const outputRoot = path.join(projectDirectory, "public", "destinations");
const views = ["aerial", "ground"];
const knownExtensions = ["png", "jpg", "webp"];

const AERIAL_RULES = `Photorealistic aerial photograph, natural colors, sharp
detail, bright clear midday light, wide 16:9 landscape frame, horizon in the
upper third. The view looks forward and slightly down in the direction of
flight from a low-flying aircraft. Only the open view outside is in the
picture: no cockpit, no window frame, no window glass reflections, no wings,
no propeller, no instruments, no aircraft parts of any kind. The sky is clean
and even. No text, captions, labels, watermarks, logos or
borders anywhere in the image.`;

const GROUND_RULES = `Photorealistic eye-level photograph taken by a person
standing on the ground, natural colors, sharp detail, bright clear midday
light, wide 16:9 landscape frame with a clear path leading forward into the
scene. Every sign, awning, shopfront, vehicle and vending machine is blank:
plain solid colors with no lettering, no brand names and no logos. No text,
captions, labels, watermarks or borders anywhere in the image.`;

const DESTINATIONS = {
  paris: {
    aerial: `Paris, France, seen from the air. The Eiffel Tower stands ahead
in the middle distance beside the Seine River, with the green Champ de Mars,
cream stone Haussmann buildings with gray zinc rooftops and tree-lined
boulevards spreading out to the horizon.`,
    ground: `A street in Paris, France. A cobblestone street lined with cream
stone Haussmann buildings, wrought-iron balconies and cafe terraces with
small round tables, the Eiffel Tower rising at the end of the street, a few
pedestrians strolling.`,
  },
  tokyo: {
    aerial: `Tokyo, Japan, seen from the air. The red and white lattice Tokyo
Tower stands ahead in the middle distance among dense glass high-rises, with
the endless city grid, elevated expressways and Tokyo Bay stretching to the
horizon.`,
    ground: `A street in Tokyo, Japan. A clean narrow street lined with small
shops, potted plants, vending machines and overhead utility wires, the red
and white lattice Tokyo Tower rising above the buildings at the end of the
street, a few pedestrians and a cyclist.`,
  },
  "los-angeles": {
    aerial: `Los Angeles, California, seen from the air. The cluster of
downtown Los Angeles skyscrapers stands ahead in the middle distance, with a
vast low grid of streets lined with tall thin palm trees, a wide freeway and
the San Gabriel Mountains along the horizon.`,
    ground: `A street in Los Angeles, California. A wide sunlit boulevard
lined on both sides with very tall thin palm trees, low stucco buildings and
parked cars, the downtown Los Angeles skyline visible at the end of the
street, a few pedestrians on the sidewalk.`,
  },
  "new-york-city": {
    aerial: `New York City seen from the air. The Midtown Manhattan skyline
stands ahead in the middle distance with the Empire State Building at its
center, dense towers on both sides, the Hudson River along one edge and
bridges over the East River in the distance.`,
    ground: `A street in Manhattan, New York City. A broad avenue between
tall stone and glass buildings, yellow taxis in traffic, steam rising from a
street vent, the Empire State Building rising at the end of the avenue,
pedestrians on the wide sidewalk.`,
  },
  boston: {
    aerial: `Boston, Massachusetts, seen from the air. The Back Bay skyline
with its tall blue glass tower stands ahead in the middle distance, the wide
Charles River in the foreground dotted with small white sailboats, a stone
arch bridge across the river and red brick rowhouses along the bank.`,
    ground: `A street in the Beacon Hill neighborhood of Boston,
Massachusetts. A narrow cobblestone lane rising gently between red brick
Federal-style rowhouses with black shutters, window boxes of flowers and
black iron gas lamps, leafy trees overhead.`,
  },
  "venice-beach": {
    aerial: `Venice Beach in Los Angeles, California, seen from the air. The
view runs along the coastline: a very wide band of pale sand, the paved
boardwalk lined with tall palm trees and low colorful buildings, the Pacific
Ocean with lines of white surf on one side, a fishing pier reaching into the
water and the Santa Monica Mountains hazy on the horizon.`,
    ground: `The Venice Beach boardwalk in Los Angeles, California. A wide
paved oceanfront walk lined with tall palm trees, colorful low shopfronts
and murals on one side and open sand with the Pacific Ocean on the other,
people walking, skating and riding beach cruiser bicycles.`,
  },
};

function extensionFor(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

/** Width and height from a PNG, JPEG or WebP (VP8X/VP8) header. */
function imageSize(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 12, 16) === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  return undefined;
}

function describeSize(buffer) {
  const size = imageSize(buffer);
  if (!size) return "size unknown";
  const ratio = size.width / size.height;
  const exact = size.width * 9 === size.height * 16;
  return `${size.width}x${size.height} (ratio ${ratio.toFixed(4)}, ${exact ? "exact 16:9" : "NOT exact 16:9, 16:9 is 1.7778"})`;
}

let sharpModule;
async function loadSharp() {
  if (sharpModule === undefined) {
    try {
      sharpModule = (await import("sharp")).default;
    } catch {
      sharpModule = null;
    }
  }
  return sharpModule;
}

/** Center-crops to the largest exact 16:9 frame. Returns the input if it cannot. */
async function cropToSixteenNine(buffer) {
  const size = imageSize(buffer);
  if (!size || size.width * 9 === size.height * 16) return buffer;
  const sharp = await loadSharp();
  if (!sharp) return buffer;
  const unit = Math.min(Math.floor(size.width / 16), Math.floor(size.height / 9));
  const width = unit * 16;
  const height = unit * 9;
  return sharp(buffer)
    // Lossless truecolour. Do not add `effort`, `quality` or `colours`:
    // sharp then quantizes to a 256-colour palette.
    .png({ compressionLevel: 9, palette: false })
    .extract({
      left: Math.floor((size.width - width) / 2),
      top: Math.floor((size.height - height) / 2),
      width,
      height,
    })
    .toBuffer();
}

async function existingFile(id, view) {
  for (const extension of knownExtensions) {
    const filePath = path.join(outputRoot, id, `${view}.${extension}`);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // Try the next extension.
    }
  }
  return undefined;
}

async function readModelName() {
  // Single source of truth for the model name is lib/nano-banana.ts.
  const source = await fs.readFile(
    path.join(projectDirectory, "lib", "nano-banana.ts"),
    "utf8",
  );
  const match = source.match(/NANO_BANANA_MODEL\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("NANO_BANANA_MODEL not found in lib/nano-banana.ts");
  return match[1];
}

async function generate(ai, model, id, view) {
  const rules = view === "aerial" ? AERIAL_RULES : GROUND_RULES;
  const prompt = `${DESTINATIONS[id][view]}\n\n${rules}`.replace(/\s+/g, " ");
  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "16:9" },
    },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const output = parts.find((part) => part.inlineData?.data)?.inlineData;
  if (!output?.data) {
    const reason = response.candidates?.[0]?.finishReason ?? "no candidate";
    throw new Error(`model returned no image (${reason})`);
  }
  return {
    buffer: Buffer.from(output.data, "base64"),
    extension: extensionFor(output.mimeType),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const requested = args.filter((arg) => !arg.startsWith("--"));

  const targets = [];
  for (const entry of requested.length > 0 ? requested : Object.keys(DESTINATIONS)) {
    const [id, view] = entry.split("/");
    if (!DESTINATIONS[id] || (view !== undefined && !views.includes(view))) {
      throw new Error(
        `Unknown target "${entry}". Ids: ${Object.keys(DESTINATIONS).join(", ")}; views: ${views.join(", ")}`,
      );
    }
    for (const each of view ? [view] : views) targets.push({ id, view: each });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured (.env.local)");
  const ai = new GoogleGenAI({ apiKey });
  const model = await readModelName();
  console.log(`[seeds] model ${model}, ${targets.length} target(s)${force ? ", --force" : ""}`);

  let failures = 0;
  for (const { id, view } of targets) {
    const label = `${id}/${view}`;
    const existing = await existingFile(id, view);
    if (existing && !force) {
      const buffer = await fs.readFile(existing);
      const cropped = await cropToSixteenNine(buffer);
      if (cropped !== buffer) await fs.writeFile(existing, cropped);
      console.log(
        `[seeds] ${cropped !== buffer ? "crop " : "skip "} ${label}: ${path.basename(existing)} exists, ${describeSize(cropped)}`,
      );
      continue;
    }
    try {
      const generated = await generate(ai, model, id, view);
      const extension = generated.extension;
      const buffer = await cropToSixteenNine(generated.buffer);
      await fs.mkdir(path.join(outputRoot, id), { recursive: true });
      const filePath = path.join(outputRoot, id, `${view}.${extension}`);
      await fs.writeFile(filePath, buffer);
      if (existing && existing !== filePath) await fs.rm(existing);
      console.log(
        `[seeds] wrote ${label}: ${view}.${extension}, ${Math.round(buffer.length / 1024)} KB, ${describeSize(buffer)}`,
      );
    } catch (error) {
      failures += 1;
      console.error(
        `[seeds] FAIL  ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures > 0) {
    console.error(`[seeds] ${failures} image(s) failed`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[seeds] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
