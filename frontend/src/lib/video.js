// Video ads, browser side. Checks the file, then samples frames for the AI
// pre-screen (the server re-checks size, type and length itself, and a person
// reviews every paid video before it goes live).
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error("This video can't be played here. Export it as MP4 (H.264) and try again."));
    video.src = url;
  });
}

const seek = (video, time) =>
  new Promise((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = time;
  });

// Returns { seconds, frames: [jpeg data URLs], previewUrl } or throws a friendly error.
export async function inspectVideo(file) {
  if (!VIDEO_TYPES.includes(file.type)) throw new Error('Use an MP4 or MOV video.');
  if (file.size > MAX_VIDEO_BYTES) throw new Error('Video must be 20 MB or smaller.');
  const previewUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(previewUrl);
    const seconds = video.duration;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("We couldn't read that video's length.");
    if (seconds > MAX_VIDEO_SECONDS + 0.5) throw new Error(`Video must be ${MAX_VIDEO_SECONDS} seconds or shorter.`);
    // Three frames (start, middle, end), scaled down: enough for screening.
    const scale = Math.min(1, 640 / (video.videoWidth || 640));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || 640) * scale);
    canvas.height = Math.round((video.videoHeight || 360) * scale);
    const ctx = canvas.getContext('2d');
    const frames = [];
    for (const at of [0.1, 0.5, 0.9]) {
      await seek(video, Math.min(seconds - 0.05, seconds * at));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.75));
    }
    return { seconds, frames, previewUrl };
  } catch (err) {
    URL.revokeObjectURL(previewUrl);
    throw err;
  }
}
