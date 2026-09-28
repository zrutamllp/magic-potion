import sharp from 'sharp';

// Every uploaded picture is decoded and saved again as WebP. That drops all metadata (EXIF
// camera and GPS data, titles, comments, colour profiles) and anything hidden in the file, so
// only the pixels are stored. Photos are turned upright first, using their EXIF orientation.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// SVG is left out on purpose: it can carry scripts.
const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);

export type CleanImageResult =
  { ok: true; data: Buffer; width: number; height: number } | { ok: false; message: string };

export async function cleanImage(input: Buffer, maxSide: number): Promise<CleanImageResult> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    return { ok: false, message: 'Upload a PNG, JPG, WebP or GIF picture.' };
  }
  const { data, info } = await sharp(input, { animated: false })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  return { ok: true, data, width: info.width, height: info.height };
}
