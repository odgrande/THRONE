import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

// Video ads. Uploaded once, before the ad is created, then referenced by a
// signed token, so a bid can only point at a file this server stored (never
// at an arbitrary URL). Video ads are never shown until a person approves
// them (see game.approveVideo): AI can screen sampled frames, but it can't
// watch every frame of a video.
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;

// MP4 and QuickTime (.mov) files are ISO-BMFF: a box whose type at byte 4 is
// "ftyp". WebM and everything else is refused.
export function isMp4(buffer) {
  return buffer.length > 12 && buffer.toString('latin1', 4, 8) === 'ftyp';
}

// Reads the movie duration from the "mvhd" box (version 0 or 1).
export function mp4DurationSeconds(buffer) {
  const at = buffer.indexOf('mvhd', 0, 'latin1');
  if (at < 0) return null;
  const body = at + 4;
  const version = buffer[body];
  try {
    if (version === 1) {
      const timescale = buffer.readUInt32BE(body + 4 + 16);
      const duration = Number(buffer.readBigUInt64BE(body + 4 + 20));
      return timescale ? duration / timescale : null;
    }
    const timescale = buffer.readUInt32BE(body + 4 + 8);
    const duration = buffer.readUInt32BE(body + 4 + 12);
    return timescale ? duration / timescale : null;
  } catch {
    return null;
  }
}

export function createVideoUploads({ storage, secret }) {
  const sign = (name) => createHmac('sha256', secret).update(`video:${name}`).digest('base64url');

  return {
    // Validates and stores an upload; returns a token for the bid to reference.
    async save(buffer) {
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Choose a video file.');
      if (buffer.length > MAX_VIDEO_BYTES) throw new Error('Video must be 20 MB or smaller.');
      if (!isMp4(buffer)) throw new Error('Use an MP4 or MOV video.');
      const seconds = mp4DurationSeconds(buffer);
      if (seconds === null) throw new Error("We couldn't read that video. Export it as MP4 and try again.");
      if (seconds > MAX_VIDEO_SECONDS + 0.5) throw new Error(`Video must be ${MAX_VIDEO_SECONDS} seconds or shorter.`);
      const name = `${randomUUID()}.mp4`;
      const url = await storage.put('videos', name, buffer, 'video/mp4');
      return { token: `${name}.${sign(name)}`, url, seconds: Math.round(seconds * 10) / 10 };
    },

    // Token -> stored file name, or null if forged.
    nameFor(token) {
      const match = typeof token === 'string' && /^([0-9a-f-]{36}\.mp4)\.([\w-]{43})$/.exec(token);
      if (!match) return null;
      const expected = Buffer.from(sign(match[1]));
      const given = Buffer.from(match[2]);
      return expected.length === given.length && timingSafeEqual(expected, given) ? match[1] : null;
    },
  };
}
