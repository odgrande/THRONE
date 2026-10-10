// Twist #4: the takeover video renderer.
//
// Pulls jobs from the hype_jobs queue, renders a 6 s vertical MP4 with
// Remotion (src/video), and records the result. Run it as its own process in
// production (`npm run worker`) so rendering never competes with bidding:
// it needs real CPU, and the first run downloads a headless Chrome.
//
// Licensing: Remotion is free for individuals and companies of up to 3 people.
// Larger teams need a company license (remotion.pro) before using it commercially.
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const ENTRY = fileURLToPath(new URL('../video/index.jsx', import.meta.url));
const COMPOSITION_ID = 'ThroneTakeover';
const IDLE_POLL_MS = 3000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function startVideoWorker({ store, storage, siteLabel }) {
  // Bundling takes 10-30 s, so do it once and reuse it for every render.
  let serveUrl = null;
  const getServeUrl = () => (serveUrl ??= bundle({ entryPoint: ENTRY }));
  let stopped = false;

  async function render(job) {
    const url = await getServeUrl();
    const inputProps = { ...job.payload, siteLabel };
    const composition = await selectComposition({ serveUrl: url, id: COMPOSITION_ID, inputProps });
    const file = `takeover-${job.id}-${job.payload.bidId.slice(0, 8)}.mp4`;
    // Render to a temp file, then hand it to storage: the worker's own disk
    // is neither shared with the API nor kept across deploys.
    const tmp = path.join(os.tmpdir(), file);
    try {
      await renderMedia({ composition, serveUrl: url, codec: 'h264', outputLocation: tmp, inputProps });
      return await storage.put('renders', file, await readFile(tmp), 'video/mp4');
    } finally {
      await rm(tmp, { force: true });
    }
  }

  // Next step for distribution: post `videoUrl` through each platform's
  // official API (TikTok Content Posting, YouTube Data, Instagram Graph, X).
  // All need app review, so apply early.
  async function loop() {
    console.log('[video] worker started');
    while (!stopped) {
      let job = null;
      try {
        job = await store.claimHypeJob();
      } catch (err) {
        console.error('[video] could not claim job', err);
      }
      if (!job) {
        await sleep(IDLE_POLL_MS);
        continue;
      }
      const started = Date.now();
      // Never advertise an ad that was taken down before its video was made.
      const bid = await store.getBid(job.payload.bidId).catch(() => null);
      if (bid?.removedAt) {
        await store.finishHypeJob(job.id, { status: 'failed', error: 'Ad was removed before rendering.' });
        continue;
      }
      try {
        const videoUrl = await render(job);
        await store.finishHypeJob(job.id, { status: 'done', videoUrl });
        console.log(`[video] job ${job.id} rendered in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${videoUrl}`);
      } catch (err) {
        console.error(`[video] job ${job.id} failed`, err);
        await store.finishHypeJob(job.id, { status: 'failed', error: String(err?.message ?? err).slice(0, 500) });
      }
    }
  }

  loop();
  return {
    stop() {
      stopped = true;
    },
  };
}

// Standalone mode: `npm run worker`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { assertProductionConfig, config } = await import('../config.js');
  const { createStore } = await import('../store/index.js');
  const { createStorage } = await import('../services/storage.js');
  assertProductionConfig('worker');
  const store = createStore(config);
  if (store.kind === 'memory') {
    console.error('[video] the in-memory store is per-process. Set SUPABASE_URL, or run with HYPE_WORKER=inline.');
    process.exit(1);
  }
  startVideoWorker({ store, storage: createStorage(config), siteLabel: new URL(config.siteUrl).host });
}
