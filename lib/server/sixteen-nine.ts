/**
 * Center-crops an image to an exact 16:9 frame. Server only.
 *
 * Nano Banana's "16:9" output is 1344x768 (ratio 1.75). `sharp` is used when
 * it can be loaded at runtime; it ships with Next.js but is not a declared
 * dependency of this project, so it is resolved lazily and never bundled. When
 * it is missing the image is returned exactly as given.
 *
 * scripts/generate-seeds.mjs applies the same crop to the preset images.
 */

import { createRequire } from "node:module";
import path from "node:path";

interface SharpInstance {
  metadata(): Promise<{ width?: number; height?: number }>;
  extract(region: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): SharpInstance;
  png(options?: { compressionLevel?: number; palette?: boolean }): SharpInstance;
  toBuffer(): Promise<Buffer>;
}
type SharpFactory = (input: Buffer) => SharpInstance;

let sharpFactory: SharpFactory | null | undefined;

function loadSharp(): SharpFactory | null {
  if (sharpFactory === undefined) {
    try {
      // Resolved from the project root at runtime with a computed name so the
      // bundler does not try to include or resolve it at build time.
      const moduleName = ["sh", "arp"].join("");
      const runtimeRequire = createRequire(
        path.join(process.cwd(), "package.json"),
      );
      const loaded: unknown = runtimeRequire(moduleName);
      sharpFactory =
        typeof loaded === "function" ? (loaded as SharpFactory) : null;
    } catch {
      sharpFactory = null;
    }
  }
  return sharpFactory;
}

export interface SixteenNineResult {
  buffer: Buffer;
  mimeType: string;
  /** Pixel size after processing; undefined when sharp is unavailable. */
  width?: number;
  height?: number;
  /** True when the returned image is exactly 16:9. */
  exact: boolean;
  /** True when this call changed the image. */
  cropped: boolean;
}

export async function cropToSixteenNine(
  buffer: Buffer,
  mimeType: string,
): Promise<SixteenNineResult> {
  const sharp = loadSharp();
  if (!sharp) return { buffer, mimeType, exact: false, cropped: false };

  try {
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) {
      return { buffer, mimeType, exact: false, cropped: false };
    }
    if (width * 9 === height * 16) {
      return { buffer, mimeType, width, height, exact: true, cropped: false };
    }
    const unit = Math.min(Math.floor(width / 16), Math.floor(height / 9));
    const cropWidth = unit * 16;
    const cropHeight = unit * 9;
    if (unit === 0) {
      return { buffer, mimeType, width, height, exact: false, cropped: false };
    }
    const output = await sharp(buffer)
      .extract({
        left: Math.floor((width - cropWidth) / 2),
        top: Math.floor((height - cropHeight) / 2),
        width: cropWidth,
        height: cropHeight,
      })
      // Lossless truecolour; `palette: false` keeps sharp from quantizing.
      .png({ compressionLevel: 6, palette: false })
      .toBuffer();
    return {
      buffer: output,
      mimeType: "image/png",
      width: cropWidth,
      height: cropHeight,
      exact: true,
      cropped: true,
    };
  } catch (caught) {
    console.error("16:9 crop failed; returning the image as generated", caught);
    return { buffer, mimeType, exact: false, cropped: false };
  }
}
