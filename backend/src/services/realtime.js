import { createHash, randomBytes } from 'node:crypto';

// Server-Sent Events hub: one long-lived HTTP stream per viewer.
// Works on any long-running Node host (Render, Railway, Fly, a VPS).
// To scale past one instance, fan events out through Redis pub/sub or
// Supabase Realtime broadcast and have every instance relay them here.
//
// Countdowns are computed in each browser from server timestamps, so a flood
// of junk traffic cannot freeze the clock; the caps below stop a single
// client from exhausting connections.
const MAX_STREAMS_PER_IP = 5;
const MAX_STREAMS_TOTAL = 20000;
const MAX_DAILY_VISITORS_TRACKED = 500000;

// "Visitors today": unique visitors since midnight UTC, counted in memory as
// salted hashes. The salt is random and replaced every day, so a hash can't
// be linked to an IP or across days, and nothing is written anywhere. Resets
// when the server restarts (it's a live counter, not analytics).
function dailyVisitors() {
  let day = null;
  let salt = null;
  let seen = new Set();
  let peak = 0;
  const roll = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (today === day) return;
    day = today;
    salt = randomBytes(16);
    seen = new Set();
    peak = 0;
  };
  return {
    visit(ip) {
      roll();
      if (seen.size < MAX_DAILY_VISITORS_TRACKED) seen.add(createHash('sha256').update(salt).update(String(ip)).digest('base64url').slice(0, 16));
    },
    online(count) {
      roll();
      peak = Math.max(peak, count);
    },
    stats: () => (roll(), { visitsToday: seen.size, peakToday: peak }),
  };
}

export function createRealtime() {
  const clients = new Set();
  const perIp = new Map();
  const visitors = dailyVisitors();
  const audience = () => {
    visitors.online(clients.size);
    return { count: clients.size, ...visitors.stats() };
  };
  let viewerTimer = null;

  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const broadcast = (event, data) => {
    for (const res of clients) send(res, event, data);
  };

  // Coalesce join/leave bursts into one viewer-count update per second.
  const scheduleViewerCount = () => {
    if (viewerTimer) return;
    viewerTimer = setTimeout(() => {
      viewerTimer = null;
      broadcast('viewers', audience());
    }, 1000);
  };

  return {
    broadcast,
    audience,

    handler(req, res) {
      const ip = req.ip;
      const open = perIp.get(ip) ?? 0;
      if (open >= MAX_STREAMS_PER_IP || clients.size >= MAX_STREAMS_TOTAL) {
        return res.status(429).end();
      }
      perIp.set(ip, open + 1);

      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      res.write('retry: 3000\n\n');

      clients.add(res);
      visitors.visit(ip);
      send(res, 'viewers', audience());
      scheduleViewerCount();

      // Keeps proxies from closing an idle stream.
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

      req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
        const left = (perIp.get(ip) ?? 1) - 1;
        if (left > 0) perIp.set(ip, left);
        else perIp.delete(ip);
        scheduleViewerCount();
      });
    },
  };
}
