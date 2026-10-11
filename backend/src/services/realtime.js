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

// Visitors are identified only by a salted hash of their IP. The salt is
// random and replaced every day (midnight UTC), so a hash can't be linked to
// an IP or across days, and no hash is ever written anywhere. These hashes
// power "online now", "visitors today" and each ad's reach (distinct people
// on the site while it was live).
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
    hash(ip) {
      roll();
      return createHash('sha256').update(salt).update(String(ip)).digest('base64url').slice(0, 16);
    },
    visit(hash) {
      roll();
      if (seen.size < MAX_DAILY_VISITORS_TRACKED) seen.add(hash);
    },
    online(count) {
      roll();
      peak = Math.max(peak, count);
    },
    stats: () => (roll(), { day, visitsToday: seen.size, peakToday: peak }),
  };
}

// regionOf(req): which edition this viewer is watching (?region=, else country).
export function createRealtime({ regions = ['global'], regionOf = () => regions[0] } = {}) {
  const clients = new Map(); // res -> { region, visitor }
  const perIp = new Map();
  const visitors = Object.fromEntries(regions.map((r) => [r, dailyVisitors()]));

  const countIn = (region) => {
    let n = 0;
    for (const c of clients.values()) if (c.region === region) n++;
    return n;
  };
  const audience = (region) => {
    const count = countIn(region);
    visitors[region].online(count);
    const { visitsToday, peakToday } = visitors[region].stats();
    return { region, count, visitsToday, peakToday };
  };
  let viewerTimer = null;

  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const broadcast = (event, data) => {
    for (const res of clients.keys()) send(res, event, data);
  };

  // Coalesce join/leave bursts into one viewer-count update per second; each
  // viewer gets the numbers for the edition they're watching.
  const scheduleViewerCount = () => {
    if (viewerTimer) return;
    viewerTimer = setTimeout(() => {
      viewerTimer = null;
      const byRegion = Object.fromEntries(regions.map((r) => [r, audience(r)]));
      for (const [res, c] of clients) send(res, 'viewers', byRegion[c.region]);
    }, 1000);
  };

  return {
    broadcast,
    audience,
    // Distinct visitors (hashes) watching an edition right now: the input for ad reach.
    viewersIn(region) {
      const set = new Set();
      for (const c of clients.values()) if (c.region === region) set.add(c.visitor);
      return set;
    },
    dailyStats: (region) => visitors[region].stats(),

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

      const region = regions.includes(regionOf(req)) ? regionOf(req) : regions[0];
      const visitor = visitors[region].hash(ip);
      clients.set(res, { region, visitor });
      visitors[region].visit(visitor);
      send(res, 'viewers', audience(region));
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
