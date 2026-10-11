import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { boardFor, minHumanMs, newSeed, replay } from './services/puzzle.js';
import { bookingPriceCents } from './rules.js';

// The Ads Game ("the arcade"): coin wallets, the Throne puzzle race, the
// Crown Shield, coin packs and invites.
//
// Fair play is enforced here, on the server, in layers:
//  1. The wallet is a 256-bit secret kept by the browser; we store only its
//     hash. The backup code restores the SAME wallet on another browser or PC.
//  2. Every attempt gets its own server-made shuffle (no shared solutions).
//     The server replays the moves and keeps the time; the browser's clock is
//     never trusted. Inhumanly fast solves are not ranked.
//  3. One open attempt at a time. Reloading resumes the same board with the
//     clock still running (no "reroll until easy").
//  4. Reset timer: a short cooldown after every try and a longer lock after
//     several unfinished or failed tries in a row.
//  5. Daily limits are counted per wallet AND per device AND per network, so
//     a new wallet, private window, other browser or other PC gives no extra
//     tries or welcome coins.
//  6. Every coin movement is in a ledger with a unique reference, so a retry
//     or a double click can never pay twice; balances can't go below zero.
//  7. Wallets are bound to their edition; admins can ban a wallet, adjust
//     coins with a logged reason, and void any result.
export function createArcade({ store, game, realtime, regions, salt, coinPacks = false }) {
  const rulesOf = (region) => game.rulesOf(region);
  const G = (region) => rulesOf(region).game;
  // Without the shop, the coin rules sent to browsers list no packs.
  const C = (region) => (coinPacks ? rulesOf(region).coins : { ...rulesOf(region).coins, packs: [] });

  const sha = (v) => createHash('sha256').update(v).digest('hex');
  const hashToken = (token) => sha(`wallet:${token}`);
  const netHash = (ip) => sha(`${salt}:net:${ip ?? ''}`);
  // The browser sends a random device id (kept in its storage) plus a few
  // stable browser traits; without one we fall back to the network.
  // Browser signature (hex SHA-256 computed in the browser): salted again here.
  const fpHashOf = (fp) => (typeof fp === 'string' && /^[0-9a-f]{64}$/.test(fp) ? sha(`${salt}:fp:${fp}`) : null);
  const deviceHash = (device, ip) => (typeof device === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(device) ? sha(`${salt}:dev:${device}`) : `net:${netHash(ip)}`);

  const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newReferralCode = () => Array.from(randomBytes(8), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  const newWalletToken = () => randomBytes(32).toString('base64url');

  // Prices in coins (rounded up). Coin-paid ads never carry money.
  const coinsFor = (cents, region) => Math.ceil(cents / C(region).centsPerCoin);
  const marketDayCoins = (region) => coinsFor(bookingPriceCents('m1', 1, rulesOf(region)), region);

  const displayName = (w) => w?.playerName || (w ? `Player ${w.id.slice(0, 4).toUpperCase()}` : 'Player');

  class GameError extends Error {
    constructor(status, message, extra = {}) {
      super(message);
      this.status = status;
      this.extra = extra;
    }
  }

  // --- Round (= the King of the Day day) ---
  async function currentRound(region) {
    const { round } = await store.tickThrone(region, rulesOf(region));
    const start = Date.parse(round.baseEndsAt) - rulesOf(region).crownRoundSeconds * 1000;
    return { id: round.id, endsAt: round.endsAt, startIso: new Date(start).toISOString() };
  }

  // --- Wallets ---
  async function walletFromToken(token) {
    if (typeof token !== 'string' || token.length < 40 || token.length > 64) return null;
    const w = await store.getWalletByHash(hashToken(token));
    // Constant-time confirm (the lookup is by hash already; this is belt and braces).
    if (!w || !timingSafeEqual(Buffer.from(w.tokenHash), Buffer.from(hashToken(token)))) return null;
    return w;
  }

  async function createWallet({ region, ip, device, fp, ref }) {
    const g = G(region);
    const since = new Date(Date.now() - 86400_000).toISOString();
    const ipHash = netHash(ip);
    const devHash = deviceHash(device, ip);
    const fpHash = fpHashOf(fp);
    // Welcome coins only for the first few new wallets per network / device /
    // browser a day (private windows and cleared storage don't reset it).
    const [byNet, byDev, byFp] = await Promise.all([
      store.countWalletsByIp(ipHash, since),
      store.countWalletsByDevice(devHash, since),
      fpHash ? store.countWalletsByFp(fpHash, since) : 0,
    ]);
    const welcome = byNet < g.welcomePerNetworkPerDay && byDev < g.welcomePerDevicePerDay && byFp < g.welcomePerDevicePerDay;

    // Invites: never from yourself (same network or device as the inviter).
    let referredBy = null;
    if (typeof ref === 'string' && /^[A-Z0-9]{8}$/.test(ref)) {
      const inviter = await store.getWalletByReferral(ref);
      if (inviter && !inviter.banned && inviter.region === region && inviter.createdIpHash !== ipHash && inviter.createdDeviceHash !== devHash && (!fpHash || inviter.createdFpHash !== fpHash)) referredBy = inviter.id;
    }

    const token = newWalletToken();
    let wallet;
    for (let i = 0; i < 3 && !wallet; i++) {
      try {
        wallet = await store.createWallet({ region, tokenHash: hashToken(token), referralCode: newReferralCode(), referredBy, ipHash, deviceHash: devHash, fpHash });
      } catch (err) {
        if (i === 2) throw err; // referral code clash: try another
      }
    }
    if (welcome) await store.applyCoins(wallet.id, C(region).welcome, 'welcome', 'welcome');
    return { token, wallet: await store.getWallet(wallet.id), welcome: welcome ? C(region).welcome : 0 };
  }

  // The streak is alive if the last daily claim was under 48 hours ago.
  const liveStreak = (w) => (w.lastDailyAt && Date.now() - Date.parse(w.lastDailyAt) < 48 * 3600_000 ? w.streakDays ?? 0 : 0);
  const dailyFor = (region, streak) => C(region).daily + Math.floor((C(region).daily * (Math.min(streak, 7) - 1)) / 6);

  // Badges, worked out from the record (nothing extra to store or fake).
  const BADGES = [
    ['first-solve', 'First solve', (r) => r.solves >= 1],
    ['ten-solves', '10 solves', (r) => r.solves >= 10],
    ['sub-60', 'Under 60s', (r) => r.bestMs && r.bestMs < 60_000],
    ['sub-45', 'Under 45s', (r) => r.bestMs && r.bestMs < 45_000],
    ['sub-30', 'Under 30s', (r) => r.bestMs && r.bestMs < 30_000],
    ['king', 'Took the Throne', (r) => r.reigns >= 1],
    ['king-of-day', 'King of the Day', (r) => r.kingOfDay >= 1],
    ['streak-3', '3-day streak', (r) => r.bestStreak >= 3],
    ['streak-7', '7-day streak', (r) => r.bestStreak >= 7],
    ['inviter', 'Brought a friend', (r) => r.qualified >= 1],
    ['ambassador', '5 friends playing', (r) => r.qualified >= 5],
  ];

  async function walletView(w) {
    const region = w.region;
    const [records, invites, card, ledger] = await Promise.all([store.walletRecords(w.id), store.listReferrals(w.id), store.getCard(w.id), store.listLedger(w.id, 1000)]);
    const dailyAt = w.lastDailyAt ? Date.parse(w.lastDailyAt) + 20 * 3600_000 : 0;
    const streak = liveStreak(w);
    const qualified = invites.filter((i) => i.referralPaid).length;
    const facts = { ...records, kingOfDay: ledger.filter((l) => l.reason === 'king-of-day').length, bestStreak: w.streakDays ?? 0, qualified };
    const badges = BADGES.map(([id, label, test]) => ({ id, label, earned: Boolean(test(facts)) }));
    return {
      id: w.id,
      region,
      balance: w.balance,
      playerName: w.playerName,
      displayName: displayName(w),
      referralCode: w.referralCode,
      banned: Boolean(w.banned),
      banReason: w.banned ? w.banReason : null,
      backedUp: Boolean(w.backedUpAt),
      dailyReadyAt: new Date(Math.max(Date.now(), dailyAt)).toISOString(),
      dailyCoins: C(region).daily,
      // What the next daily claim pays (the streak grows it, up to double on day 7).
      streak,
      nextDailyCoins: dailyFor(region, Date.parse(w.lastDailyAt ?? 0) + 48 * 3600_000 > Math.max(Date.now(), dailyAt) ? streak + 1 : 1),
      badges,
      records: { ...records, kingOfDay: facts.kingOfDay },
      invites: { total: invites.length, qualified },
      card: card && cardView(card),
      coins: { ...C(region), marketDayCoins: marketDayCoins(region) },
      game: G(region),
    };
  }

  const cardView = (c) => ({ name: c.name, tagline: c.tagline, targetUrl: c.targetUrl, imageUrl: c.imageUrl, status: c.status, reason: c.reason, reviewSince: c.reviewSince });

  function requireActive(w) {
    if (!w) throw new GameError(401, 'Your wallet was not found. Restore it with your backup code, or start a new one.', { noWallet: true });
    if (w.banned) throw new GameError(403, `This wallet is suspended${w.banReason ? `: ${w.banReason}` : ''}. Email therone@gmail.com if you think this is a mistake.`, { banned: true });
  }

  async function claimDaily(w) {
    requireActive(w);
    const r = await store.claimDaily(w.id, C(w.region).daily);
    if (r.balance < 0) throw new GameError(429, 'Your daily coins are already claimed. Come back tomorrow.');
    return { balance: r.balance, coins: r.coins, streak: r.streak };
  }

  // --- Invites: rewards both sides once the friend really plays ---
  async function qualifyReferral(w) {
    if (!w.referredBy || w.referralPaid) return;
    await store.setWalletFields(w.id, { referralPaid: true });
    const inviter = await store.getWallet(w.referredBy);
    if (!inviter || inviter.banned) return;
    const coins = C(w.region).referral;
    await store.applyCoins(w.id, coins, 'referral', `invited-by:${inviter.id}`);
    await store.applyCoins(inviter.id, coins, 'referral', `invited:${w.id}`);
    // Free ad time: every few friends who play = one free Market stall day.
    const qualified = await store.countReferrals(inviter.id);
    const every = G(w.region).milestoneInvites;
    if (qualified > 0 && qualified % every === 0) {
      await store.applyCoins(inviter.id, marketDayCoins(w.region), 'adtime', `milestone:${qualified}`);
    }
  }

  // The inviter earns a share of the coins an invited friend spends on ads or buys.
  async function payCommission(w, coins, sourceRef) {
    if (!w.referredBy || !w.referralPaid || coins <= 0) return;
    const inviter = await store.getWallet(w.referredBy);
    if (!inviter || inviter.banned) return;
    const share = Math.floor((coins * G(w.region).commissionPct) / 100);
    if (share > 0) await store.applyCoins(inviter.id, share, 'commission', `${w.id}:${sourceRef}`);
  }

  async function affiliates(w) {
    const [invites, ledger] = await Promise.all([store.listReferrals(w.id), store.listLedger(w.id, 1000)]);
    const earnedFrom = {};
    let referral = 0;
    let commission = 0;
    let adtime = 0;
    for (const l of ledger) {
      if (l.reason === 'commission') {
        commission += l.delta;
        const friend = String(l.ref).split(':')[0];
        earnedFrom[friend] = (earnedFrom[friend] ?? 0) + l.delta;
      } else if (l.reason === 'referral') {
        referral += l.delta;
        const friend = String(l.ref).startsWith('invited:') ? String(l.ref).slice(8) : null;
        if (friend) earnedFrom[friend] = (earnedFrom[friend] ?? 0) + l.delta;
      } else if (l.reason === 'adtime') adtime += l.delta;
    }
    const qualified = invites.filter((i) => i.referralPaid).length;
    const every = G(w.region).milestoneInvites;
    return {
      referralCode: w.referralCode,
      totals: { invited: invites.length, qualified, referralCoins: referral, commissionCoins: commission, adTimeCoins: adtime, earnedCoins: referral + commission + adtime },
      nextMilestone: { every, remaining: every - (qualified % every), rewardCoins: marketDayCoins(w.region) },
      rewards: { referral: C(w.region).referral, commissionPct: G(w.region).commissionPct },
      // Friends are shown by player name only (never ids or networks).
      friends: invites.map((i) => ({
        name: i.playerName || `Player ${i.id.slice(0, 4).toUpperCase()}`,
        joinedAt: i.createdAt,
        playing: i.referralPaid,
        suspended: Boolean(i.banned),
        earnedCoins: earnedFrom[i.id] ?? 0,
      })),
    };
  }

  // --- The game ---
  // Expires an attempt left open too long (counts as a failed try).
  async function expireIfStale(a) {
    if (a.status !== 'started') return a;
    if (Date.now() - Date.parse(a.startedAt) <= G(a.region).attemptTtlSeconds * 1000) return a;
    await store.finishAttempt(a.id, { status: 'failed', finishedAt: new Date().toISOString() });
    return { ...a, status: 'failed', finishedAt: new Date().toISOString() };
  }

  // Everything that decides whether a new try may start, shown to the player
  // before they press Play (and enforced again when they do).
  async function playStatus(w, { ip, device, fp }) {
    const region = w.region;
    const g = G(region);
    const round = await currentRound(region);
    const ipHash = netHash(ip);
    const devHash = deviceHash(device, ip);
    const now = Date.now();

    // Recent tries of this wallet and this device (catches wallet switching).
    const [mine, onDevice, onBrowser] = await Promise.all([
      store.recentAttempts({ walletId: w.id, limit: g.failStreak + 1 }),
      store.recentAttempts({ deviceHash: devHash, limit: g.failStreak + 1 }),
      // Same browser in a private window / after clearing storage: the reset
      // timer still applies (signature only; daily tries are not shared).
      fpHashOf(fp) ? store.recentAttempts({ fpHash: fpHashOf(fp), limit: g.failStreak + 1 }) : [],
    ]);
    const seen = new Map();
    for (const a of [...mine, ...onDevice, ...onBrowser]) seen.set(a.id, await expireIfStale(a));
    const recent = [...seen.values()].sort((x, y) => (x.startedAt < y.startedAt ? 1 : -1));
    const open = recent.find((a) => a.status === 'started' && a.walletId === w.id);

    const lastEnd = (a) => Date.parse(a.finishedAt ?? a.startedAt);
    let readyAt = now;
    if (recent[0] && recent[0].status !== 'started') readyAt = Math.max(readyAt, lastEnd(recent[0]) + g.cooldownSeconds * 1000);
    const streak = recent.slice(0, g.failStreak);
    let locked = false;
    if (streak.length === g.failStreak && streak.every((a) => a.status !== 'solved' && a.status !== 'started')) {
      const lockUntil = lastEnd(streak[0]) + g.lockSeconds * 1000;
      if (lockUntil > now) {
        readyAt = Math.max(readyAt, lockUntil);
        locked = true;
      }
    }

    const since = round.startIso;
    const [freeMine, freeDevice, netAll, paidMine] = await Promise.all([
      store.countAttempts({ walletId: w.id, sinceIso: since, paid: false }),
      store.countAttempts({ deviceHash: devHash, sinceIso: since, paid: false }),
      store.countAttempts({ ipHash, sinceIso: since }),
      store.countAttempts({ walletId: w.id, sinceIso: since, paid: true }),
    ]);
    const freeLeft = Math.max(0, Math.min(g.freeAttemptsPerDay - freeMine, g.freeAttemptsPerDay - freeDevice));
    const networkLeft = Math.max(0, g.networkAttemptsPerDay + g.paidAttemptsPerDay - netAll);
    const paidLeft = Math.max(0, g.paidAttemptsPerDay - paidMine);
    const card = await store.getCard(w.id);

    return {
      round,
      open,
      readyAt: new Date(readyAt).toISOString(),
      locked,
      freeLeft: networkLeft > 0 ? freeLeft : 0,
      paidLeft: networkLeft > 0 ? paidLeft : 0,
      networkLeft,
      extraAttemptCoins: C(region).extraAttempt,
      cardStatus: card?.status ?? null,
      ipHash,
      devHash,
      fpHash: fpHashOf(fp),
    };
  }

  const publicStatus = ({ round, open, readyAt, locked, freeLeft, paidLeft, extraAttemptCoins, cardStatus }) => ({
    roundId: round.id,
    roundEndsAt: round.endsAt,
    openAttemptId: open?.id ?? null,
    readyAt,
    locked,
    freeLeft,
    paidLeft,
    extraAttemptCoins,
    cardStatus,
  });

  async function kingInfo(region, roundId) {
    const { bid } = await store.getThrone(region);
    if (!bid || bid.removedAt) return null;
    const isGame = bid.scoreMs != null && bid.gameRoundId === roundId;
    const shielded = Date.now() < Date.parse(bid.shieldEndsAt ?? 0);
    return {
      bidId: bid.id,
      name: bid.name,
      scoreMs: isGame ? bid.scoreMs : null,
      shieldEndsAt: shielded ? bid.shieldEndsAt : null,
      // The time a challenger must beat right now.
      toBeatMs: isGame ? (shielded ? Math.floor(bid.scoreMs * 0.9) : bid.scoreMs) : null,
      walletId: bid.walletId ?? null,
    };
  }

  const attemptView = (a, extra = {}) => ({
    attemptId: a.id,
    board: boardFor(a.seed),
    size: 4,
    startedAt: a.startedAt,
    serverTime: new Date().toISOString(),
    expiresAt: new Date(Date.parse(a.startedAt) + G(a.region).attemptTtlSeconds * 1000).toISOString(),
    paidCoins: a.paidCoins,
    ...extra,
  });

  async function start(w, { ip, device, fp, pay }) {
    requireActive(w);
    const region = w.region;
    const status = await playStatus(w, { ip, device, fp });
    // Reload / second tab: the same board, clock still running.
    if (status.open) return { resumed: true, ...attemptView(status.open), status: publicStatus(status) };
    if (status.cardStatus !== 'approved') {
      throw new GameError(409, status.cardStatus === 'review' ? 'Your ad card is being checked. You can play as soon as it is approved.' : 'Set up your ad card first: it is what shows on the Throne when you win.', { needsCard: true });
    }
    if (Date.parse(status.readyAt) > Date.now()) {
      throw new GameError(429, status.locked ? 'Several unfinished tries in a row. Take a short break, then try again.' : 'Get ready... the next try opens in a moment.', { status: publicStatus(status) });
    }
    if (status.networkLeft <= 0) throw new GameError(429, 'Daily limit reached for your network. New tries open tomorrow.', { status: publicStatus(status) });

    let paidCoins = 0;
    if (status.freeLeft <= 0) {
      if (status.paidLeft <= 0) throw new GameError(429, 'That is all the tries for today. The race resets tomorrow.', { status: publicStatus(status) });
      if (pay !== true) throw new GameError(402, `Your free tries for today are used. Play again for ${C(region).extraAttempt} coins?`, { needsPay: true, status: publicStatus(status) });
      paidCoins = C(region).extraAttempt;
    }

    const id = randomUUID();
    if (paidCoins) {
      try {
        await store.applyCoins(w.id, -paidCoins, 'attempt', id);
      } catch (err) {
        if (/insufficient/.test(err.message)) throw new GameError(402, 'Not enough coins. Solve puzzles, claim your daily coins or invite friends.', { needsCoins: true });
        throw err;
      }
    }
    let a;
    try {
      a = await store.createAttempt({ walletId: w.id, region, roundId: status.round.id, seed: newSeed(), paidCoins, ipHash: status.ipHash, deviceHash: status.devHash, fpHash: status.fpHash });
    } catch (err) {
      // The try was paid for but never dealt: give the coins back.
      if (paidCoins) await store.applyCoins(w.id, paidCoins, 'refund', id).catch(() => {});
      throw err;
    }
    // (store generates its own id; the coin ledger ref above only needs to be unique)
    return { resumed: false, ...attemptView(a), status: publicStatus({ ...status, freeLeft: paidCoins ? status.freeLeft : status.freeLeft - 1, readyAt: new Date().toISOString() }) };
  }

  async function abandon(w, attemptId) {
    const a = await store.getAttempt(attemptId);
    if (!a || a.walletId !== w.id) throw new GameError(404, 'Game not found.');
    await store.finishAttempt(a.id, { status: 'failed', finishedAt: new Date().toISOString() });
    return { ok: true };
  }

  async function finish(w, attemptId, moves) {
    requireActive(w);
    const finishedAt = Date.now();
    const a = await store.getAttempt(attemptId);
    if (!a || a.walletId !== w.id) throw new GameError(404, 'Game not found.');
    if (a.status !== 'started') throw new GameError(409, 'This game is already over.');
    const durationMs = finishedAt - Date.parse(a.startedAt);
    const fin = (status, extra = {}) => store.finishAttempt(a.id, { status, finishedAt: new Date(finishedAt).toISOString(), durationMs, ...extra });

    if (durationMs > G(a.region).attemptTtlSeconds * 1000) {
      await fin('failed');
      throw new GameError(409, 'Time ran out for this game.');
    }
    const result = replay(a.seed, moves);
    if (result.error || !result.solved) {
      await fin('failed', { moves: Array.isArray(moves) ? Math.min(moves.length, 2000) : null });
      throw new GameError(422, result.error ? 'Those moves do not fit this board.' : 'The puzzle is not solved yet.');
    }
    if (durationMs < minHumanMs(result.moves)) {
      await fin('too_fast', { moves: result.moves });
      console.warn(`[arcade] too-fast solve by wallet ${w.id}: ${result.moves} moves in ${durationMs} ms`);
      throw new GameError(422, 'That was faster than humanly possible, so it was not ranked.');
    }
    // Personal best: compare with the record before this solve counts.
    const prevBest = (await store.walletRecords(w.id)).bestMs;
    // Atomic: only the first finish of a started attempt counts.
    if (!(await fin('solved', { moves: result.moves }))) throw new GameError(409, 'This game is already over.');

    const region = a.region;
    await qualifyReferral(w).catch((err) => console.error('[arcade] referral', err));

    // Earn by playing: coins for each of the first few solves of the day.
    let solveCoins = 0;
    const solvedToday = (await store.listAttemptsAdmin({ walletId: w.id, status: 'solved', limit: 50 })).filter((x) => x.roundId === a.roundId).length;
    if (solvedToday <= G(a.region).rewardedSolvesPerDay) {
      solveCoins = C(a.region).solve;
      await store.applyCoins(w.id, solveCoins, 'solve', a.id).catch(() => (solveCoins = 0));
    }

    // Enter the Throne race when this time can win right now (the locked SQL
    // settlement decides races between simultaneous solves).
    const round = await currentRound(region);
    const king = await kingInfo(region, round.id);
    let crowned = false;
    const card = await store.getCard(w.id);
    const sameRound = a.roundId === round.id;
    if (sameRound && card?.status === 'approved' && (!king || king.toBeatMs === null || durationMs < king.toBeatMs)) {
      const bid = await store.createBid({
        region,
        board: 'throne',
        amountCents: 0,
        ownerHash: sha(`owner:${randomUUID()}`),
        name: card.name,
        tagline: card.tagline,
        imageUrl: card.imageUrl,
        targetUrl: card.targetUrl,
        termsVersion: card.termsVersion,
        scoreMs: durationMs,
        walletId: w.id,
      });
      const settled = await game.settle(bid.id, `game:${a.id}`);
      crowned = settled.status === 'won';
      if (crowned) {
        await store.applyCoins(w.id, C(region).takeover, 'takeover', `round:${round.id}`).catch(() => {});
        if (king?.walletId && king.walletId !== w.id) realtime.broadcast('dethroned', { region, walletHint: king.walletId.slice(0, 8) });
      }
    }

    const board = await store.gameLeaderboard(region, round.id, 100);
    const rank = board.findIndex((e) => e.walletId === w.id) + 1 || null;
    realtime.broadcast('solve', { region, name: displayName(w), ms: durationMs, crowned, rank });
    const balance = (await store.getWallet(w.id)).balance;
    return {
      status: 'solved',
      durationMs,
      moves: result.moves,
      crowned,
      rank,
      balance,
      solveCoins,
      personalBest: !prevBest || durationMs < prevBest,
      previousBestMs: prevBest ?? null,
      // How close a non-winning time came to the Throne.
      gapMs: !crowned && sameRound && king?.toBeatMs ? durationMs - king.toBeatMs : null,
      takeoverCoins: crowned ? C(region).takeover : 0,
      cardApproved: card?.status === 'approved',
    };
  }

  async function leaderboard(region, viewer) {
    const round = await currentRound(region);
    const [top, stats, king] = await Promise.all([store.gameLeaderboard(region, round.id, 20), store.gameStats(region, round.id), kingInfo(region, round.id)]);
    return {
      roundId: round.id,
      roundEndsAt: round.endsAt,
      king: king && { name: king.name, scoreMs: king.scoreMs, toBeatMs: king.toBeatMs, shieldEndsAt: king.shieldEndsAt, mine: Boolean(viewer && king.walletId === viewer.id) },
      top: top.map((e, i) => ({ rank: i + 1, name: e.playerName || `Player ${e.walletId.slice(0, 4).toUpperCase()}`, bestMs: e.bestMs, solves: e.solves, me: Boolean(viewer && e.walletId === viewer.id) })),
      stats,
      shield: { blockMinutes: G(region).shieldBlockMinutes, maxMinutes: G(region).shieldMaxMinutes, blockCoins: C(region).shieldBlock },
    };
  }

  // "Pay to stay": the reigning king buys Crown Shield time with coins.
  // While shielded, a challenger must be 10% faster.
  async function buyShield(w, blocks) {
    requireActive(w);
    if (!Number.isInteger(blocks) || blocks < 1 || blocks > 6) throw new GameError(400, 'Choose 1 to 6 shield blocks.');
    const region = w.region;
    const g = G(region);
    const { bid } = await store.getThrone(region);
    const round = await currentRound(region);
    if (!bid || bid.walletId !== w.id || bid.removedAt || bid.gameRoundId !== round.id) throw new GameError(403, 'Only the reigning king can buy a Crown Shield.');
    const now = Date.now();
    const from = Math.max(now, Date.parse(bid.shieldEndsAt ?? 0) || 0);
    const cap = now + g.shieldMaxMinutes * 60_000;
    // (a second of slack so "fill to the maximum" isn't lost to clock drift)
    const room = Math.floor((cap - from + 1000) / (g.shieldBlockMinutes * 60_000));
    const buy = Math.min(blocks, room);
    if (buy <= 0) throw new GameError(409, `Your shield is already at the ${g.shieldMaxMinutes}-minute maximum.`);
    const cost = buy * C(region).shieldBlock;
    try {
      await store.applyCoins(w.id, -cost, 'shield', `shield:${bid.id}:${from}`);
    } catch (err) {
      if (/insufficient/.test(err.message)) throw new GameError(402, 'Not enough coins for that shield.', { needsCoins: true });
      throw err;
    }
    const until = new Date(from + buy * g.shieldBlockMinutes * 60_000).toISOString();
    await store.setShield(bid.id, until);
    realtime.broadcast('shield', { region, name: bid.name, until });
    return { shieldEndsAt: until, blocks: buy, coins: cost, balance: (await store.getWallet(w.id)).balance };
  }

  // King of the Day: whoever holds the Throne at the daily cutoff.
  game.hooks.onCrowned = async (bid, crowned) => {
    if (!bid?.walletId) return;
    await store.applyCoins(bid.walletId, C(bid.region).kingOfDay, 'king-of-day', `round:${crowned.roundId}`);
  };

  // --- Coin packs (real money in; coins out; never the other way) ---
  function packOf(region, id) {
    if (!coinPacks) return null;
    return C(region).packs.find((p) => p.id === id) ?? null;
  }
  async function settleCoinOrder(order, paymentRef) {
    const r = await store.payCoinOrder(order.id, paymentRef);
    if (r.status === 'paid') {
      const w = await store.getWallet(order.walletId);
      if (w) await payCommission(w, order.coins, `order:${order.id}`).catch((err) => console.error('[arcade] commission', err));
      realtime.broadcast('coins', { region: order.region });
    }
    return r;
  }

  // --- Spending coins on ad time ---
  async function spendForAd(w, coins, ref) {
    requireActive(w);
    try {
      return await store.applyCoins(w.id, -coins, 'ad', ref);
    } catch (err) {
      if (/insufficient/.test(err.message)) throw new GameError(402, `Not enough coins: this needs ${coins.toLocaleString()} coins.`, { needsCoins: true });
      throw err;
    }
  }

  // Ad cards held for review (Nigeria): approved once the hold has passed
  // unless an admin rejected them first.
  async function expireCardReviews() {
    for (const c of await store.listCardReviews()) {
      const hold = (rulesOf(c.region).reviewHoldSeconds ?? 0) * 1000;
      if (Date.now() - Date.parse(c.reviewSince) >= hold) await store.upsertCard(c.walletId, { status: 'approved' });
    }
  }

  return {
    GameError,
    expireCardReviews,
    hashToken,
    netHash,
    deviceHash,
    coinsFor,
    marketDayCoins,
    displayName,
    walletFromToken,
    createWallet,
    walletView,
    cardView,
    requireActive,
    claimDaily,
    affiliates,
    playStatus: async (w, ctx) => publicStatus(await playStatus(w, ctx)),
    start,
    abandon,
    finish,
    leaderboard,
    buyShield,
    packOf,
    settleCoinOrder,
    spendForAd,
    payCommission,
    newWalletToken,
  };
}
