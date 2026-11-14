import { GoogleGenAI } from "@google/genai";

import { NANO_BANANA_MODEL } from "@/lib/nano-banana";
import {
  NO_STORE_HEADERS,
  errorResponse,
  readFormData,
  readPlaceHint,
  readUploadedImage,
} from "@/lib/server/sim-http";
import { cropToSixteenNine } from "@/lib/server/sixteen-nine";
import { buildSeedPrompt } from "@/lib/sim/prompts/seed";
import type { SeedView } from "@/lib/sim/types";

/** One attempt; image generation usually takes around ten seconds. */
const GENERATION_TIMEOUT_MS = 45_000;

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse("GEMINI_API_KEY is not configured", 500);
  }

  const form = await readFormData(request);
  if (!form) {
    return errorResponse("Send multipart form data with image and view", 400);
  }

  const viewField = form.get("view");
  if (viewField !== "aerial" && viewField !== "ground") {
    return errorResponse("view must be aerial or ground", 400);
  }
  const view: SeedView = viewField;

  const image = await readUploadedImage(form);
  if (!image.ok) {
    return errorResponse(image.message, image.status);
  }

  const startedAt = Date.now();
  const signal = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: NANO_BANANA_MODEL,
      contents: [
        { text: buildSeedPrompt(view, readPlaceHint(form)) },
        {
          inlineData: {
            mimeType: image.mimeType,
            data: image.buffer.toString("base64"),
          },
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "16:9" },
        abortSignal: signal,
      },
    });
    const generationMs = Date.now() - startedAt;

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const output = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!output?.data) {
      return errorResponse("Nano Banana returned no seed image", 502);
    }

    const seed = await cropToSixteenNine(
      Buffer.from(output.data, "base64"),
      output.mimeType || "image/png",
    );

    return new Response(new Uint8Array(seed.buffer), {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": seed.mimeType,
        "Server-Timing": `nano-banana;dur=${generationMs}`,
        // Lets the caller see whether the frame is exactly 16:9.
        "X-Seed-Exact-16-9": seed.exact ? "1" : "0",
        ...(seed.width && seed.height
          ? { "X-Seed-Size": `${seed.width}x${seed.height}` }
          : {}),
      },
    });
  } catch (caught) {
    if (signal.aborted) {
      console.error(`Sim seed generation timed out after ${GENERATION_TIMEOUT_MS} ms`);
      return errorResponse("Nano Banana took too long to create the seed image", 504);
    }
    console.error("Sim seed generation failed", caught);
    return errorResponse("Nano Banana could not create the seed image", 502);
  }
}
