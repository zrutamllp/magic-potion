import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cleanImage } from './image';

// A small photo carrying the kind of metadata that must never be kept.
async function photoWithMetadata(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3366aa' } })
    .jpeg()
    .withExif({
      IFD0: { ImageDescription: 'Mahendra Singh Dhoni', Artist: 'Someone', Copyright: 'Secret' },
    })
    .toBuffer();
}

describe('cleanImage', () => {
  it('removes all metadata and saves WebP', async () => {
    const input = await photoWithMetadata();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await cleanImage(input, 512);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(result.data.toString('latin1')).not.toContain('Dhoni');
  });

  it('shrinks a large picture to fit, keeping its shape', async () => {
    const result = await cleanImage(await photoWithMetadata(2000, 1000), 512);
    expect(result).toMatchObject({ ok: true, width: 512, height: 256 });
  });

  it('never makes a small picture bigger', async () => {
    const result = await cleanImage(await photoWithMetadata(100, 50), 512);
    expect(result).toMatchObject({ ok: true, width: 100, height: 50 });
  });

  it('refuses SVG and files that are not pictures', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    );
    for (const input of [svg, Buffer.from('hello'), Buffer.alloc(0)]) {
      expect(await cleanImage(input, 512)).toEqual({
        ok: false,
        message: 'Upload a PNG, JPG, WebP or GIF picture.',
      });
    }
  });
});
