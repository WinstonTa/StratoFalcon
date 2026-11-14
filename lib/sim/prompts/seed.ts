/**
 * Image prompt for POST /api/sim/seed: Nano Banana re-views the place in an
 * uploaded photo from the other vantage point. This text goes to the image
 * model, not to Orbis, so the Orbis "no negation" rule does not apply here.
 */

import type { SeedView } from "../types";

const SHARED_RULES = `Keep it the same place: the same landmarks, buildings,
terrain, vegetation, materials and colors as in the reference photo, with the
same time of day, light and weather. Photorealistic, natural colors, sharp
detail, wide 16:9 landscape frame. No text, captions, labels, watermarks,
logos or borders anywhere in the image.`;

const GROUND_PROMPT = `The attached photo shows a place, possibly from high
above or from far away. Generate a completely new photograph taken at that
same place by a person standing on the ground inside the scene. The camera is
1.6 meters above the ground, at the eye height of a pedestrian, pointing
horizontally along a street, path or open ground that leads forward. The
horizon sits near the middle of the frame, nearby buildings, trees and
objects rise above the camera, and the ground surface fills the lower third.
The most recognizable landmark or feature of the place is visible ahead, seen
from below. If the reference shows people, animals or objects, keep them in
the scene at a natural distance. This is a different camera position from
the reference: do not repeat the reference framing, and do not show a
rooftop, overhead, drone or bird's-eye view.`;

const AERIAL_PROMPT = `The attached photo shows a place, possibly from the
ground. Generate a completely new photograph of that same place taken from
an aircraft flying a few hundred meters above it. The camera looks forward
in the direction of flight and slightly down. Rooftops, treetops, roads and
terrain are seen from above and spread out below, the most recognizable
landmark or feature of the place lies ahead in the middle distance, and the
horizon sits in the upper third of the frame. Only the open view outside is
in the picture: no cockpit, no window frame, no wings, no propeller, no
instruments, no aircraft parts of any kind. This is a different camera
position from the reference: do not repeat the reference framing, and do not
show a ground-level or eye-level view.`;

export function buildSeedPrompt(view: SeedView, placeHint: string): string {
  return [
    view === "ground" ? GROUND_PROMPT : AERIAL_PROMPT,
    SHARED_RULES,
    placeHint ? `The place is said to be: ${placeHint}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/[ \t]*\n(?!\n)[ \t]*/g, " ");
}
