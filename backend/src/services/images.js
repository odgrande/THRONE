import { randomUUID } from 'node:crypto';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Identify by magic bytes, never by the client's claimed MIME type.
// SVG is deliberately not accepted (it can carry script).
const SIGNATURES = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { ext: 'gif', mime: 'image/gif', test: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

// Ads are uploaded, not hot-linked: a hot-linked URL could be swapped for
// different content after it passed moderation.
export function decodeImage(dataUrl) {
  const match = /^data:image\/[a-z+.-]+;base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error('Image must be an uploaded PNG, JPEG, GIF or WebP.');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image must be 2 MB or smaller.');
  const sig = SIGNATURES.find((s) => s.test(buffer));
  if (!sig) throw new Error('Image must be a PNG, JPEG, GIF or WebP.');
  return { buffer, ext: sig.ext, mime: sig.mime, dataUrl: `data:${sig.mime};base64,${match[1]}` };
}

export function saveImage({ buffer, ext, mime }, storage) {
  return storage.put('uploads', `${randomUUID()}.${ext}`, buffer, mime);
}
