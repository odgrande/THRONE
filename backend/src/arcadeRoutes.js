// HTTP routes for the Ads Game: wallet, game, coins, invites — and the admin
// tools that moderate all of it. The logic lives in arcade.js.

const WALLET_HEADER = 'x-wallet';
const DEVICE_HEADER = 'x-device';
const FP_HEADER = 'x-fp';
const NAME = /^[\p{L}\p{N} ._-]{2,24}$/u;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mountArcade(app, deps) {
  const { arcade, store, game, payments, config, limiter, handle, Reject, requireHuman, vetAd, validateBid, paymentEmail, regionOf, UUID, politicalMatch, moderation } = deps;

  const ctx = (req) => ({ ip: req.ip, device: req.get(DEVICE_HEADER), fp: req.get(FP_HEADER) });
  const walletOf = async (req) => arcade.walletFromToken(req.get(WALLET_HEADER));
  // Arcade errors -> clean JSON answers.
  const play = (fn) =>
    handle(async (req, res) => {
      try {
        await fn(req, res);
      } catch (err) {
        if (err instanceof arcade.GameError) throw new Reject(err.status, err.message, err.extra);
        throw err;
      }
    });
  const needWallet = async (req) => {
    const w = await walletOf(req);
    arcade.requireActive(w);
    return w;
  };

  const walletLimiter = limiter(60, 'Too many wallet requests. Wait a minute.');
  const gameLimiter = limiter(30, 'Too many game requests. Slow down for a minute.');

  // --- Wallet (no signup: the browser keeps a secret code) ---
  // A new wallet. Bot-checked, and welcome coins are capped per network and
  // device, so farming wallets gets nothing.
  app.post(
    '/api/wallet',
    limiter(5, 'Too many new wallets from your network. Try again later.'),
    play(async (req, res) => {
      await requireHuman(req);
      const ref = typeof req.body?.ref === 'string' ? req.body.ref.trim().toUpperCase() : null;
      const { token, wallet, welcome } = await arcade.createWallet({ region: regionOf(req), ...ctx(req), ref });
      // The token is shown exactly once; only its hash is stored.
      res.status(201).json({ token, welcome, wallet: await arcade.walletView(wallet) });
    }),
  );

  // Reads the wallet (also how "restore with backup code" works: the code IS
  // the wallet key, so the same wallet opens on any browser or PC).
  app.get(
    '/api/wallet',
    walletLimiter,
    play(async (req, res) => {
      const w = await walletOf(req);
      if (!w) throw new Reject(404, 'No wallet found for that code. Check the backup code and try again.', { noWallet: true });
      res.set('Cache-Control', 'no-store');
      res.json({ wallet: await arcade.walletView(w) });
    }),
  );
  // Restoring by typing the code is brute-force protected by a strict limit.
  app.post(
    '/api/wallet/restore',
    limiter(5, 'Too many restore attempts. Wait a minute.'),
    play(async (req, res) => {
      const code = typeof req.body?.code === 'string' ? req.body.code.replace(/\s/g, '') : '';
      const w = await arcade.walletFromToken(code);
      if (!w) throw new Reject(404, 'That backup code does not match any wallet.');
      res.json({ token: code, wallet: await arcade.walletView(w) });
    }),
  );

  app.post(
    '/api/wallet/backed-up',
    walletLimiter,
    play(async (req, res) => {
      const w = await walletOf(req);
      if (!w) throw new Reject(404, 'Wallet not found.', { noWallet: true });
      if (!w.backedUpAt) await store.setWalletFields(w.id, { backedUpAt: new Date().toISOString() });
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/wallet/daily',
    walletLimiter,
    play(async (req, res) => res.json(await arcade.claimDaily(await needWallet(req)))),
  );

  app.post(
    '/api/wallet/name',
    walletLimiter,
    play(async (req, res) => {
      const w = await needWallet(req);
      const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
      if (!NAME.test(name)) throw new Reject(400, 'Names are 2-24 letters, numbers, spaces, dots, dashes or underscores.');
      if (politicalMatch(name)) throw new Reject(422, 'Please choose a different name.');
      if (!(await moderation.check({ text: name })).ok) throw new Reject(422, 'That name breaks the content rules.');
      await store.setWalletFields(w.id, { playerName: name });
      res.json({ wallet: await arcade.walletView(await store.getWallet(w.id)) });
    }),
  );

  app.get(
    '/api/wallet/ledger',
    walletLimiter,
    play(async (req, res) => {
      const w = await walletOf(req);
      if (!w) throw new Reject(404, 'Wallet not found.', { noWallet: true });
      res.set('Cache-Control', 'no-store');
      res.json({ items: (await store.listLedger(w.id, 100)).map(({ delta, reason, balanceAfter, at }) => ({ delta, reason, balanceAfter, at })) });
    }),
  );

  // --- Invites / affiliates ---
  app.get(
    '/api/wallet/affiliates',
    walletLimiter,
    play(async (req, res) => {
      const w = await walletOf(req);
      if (!w) throw new Reject(404, 'Wallet not found.', { noWallet: true });
      res.set('Cache-Control', 'no-store');
      res.json(await arcade.affiliates(w));
    }),
  );

  // --- The ad card: what shows on the Throne when this player wins ---
  // Screened like any paid ad (link safety, AI moderation, political filter).
  // In an edition with a review hold (Nigeria, ARCON) it waits in the admin
  // queue first; otherwise it is approved straight away.
  app.post(
    '/api/wallet/card',
    limiter(6, 'Too many changes. Wait a minute.'),
    play(async (req, res) => {
      const w = await needWallet(req);
      const rules = game.rulesOf(w.region);
      const input = validateBid({ ...req.body, amountCents: 1, withMap: false, withVideo: false }, rules);
      if (input.error) throw new Reject(400, input.error, input.needsTerms ? { needsTerms: true } : {});
      await requireHuman(req);
      const old = await store.getCard(w.id);
      // Always screened (name, tagline, link); a new picture replaces the old one.
      const vetted = await vetAd(req, input);
      const imageUrl = vetted ?? (req.body.keepImage === true ? old?.imageUrl ?? null : null);
      const hold = (rules.reviewHoldSeconds ?? 0) > 0;
      const card = await store.upsertCard(w.id, {
        region: w.region,
        name: input.name,
        tagline: input.tagline || null,
        targetUrl: input.targetUrl,
        imageUrl,
        termsVersion: input.termsVersion,
        status: hold ? 'review' : 'approved',
        reason: null,
        reviewSince: hold ? new Date().toISOString() : null,
      });
      res.json({ card: arcade.cardView(card), holdMinutes: hold ? Math.ceil(rules.reviewHoldSeconds / 60) : 0 });
    }),
  );

  // --- The game ---
  app.get(
    '/api/game/status',
    gameLimiter,
    play(async (req, res) => {
      const w = await needWallet(req);
      res.set('Cache-Control', 'no-store');
      res.json(await arcade.playStatus(w, ctx(req)));
    }),
  );

  app.post(
    '/api/game/start',
    limiter(10, 'Too many games started. Wait a minute.'),
    play(async (req, res) => {
      const w = await needWallet(req);
      if (await store.isPaused(w.region)) throw new Reject(503, 'The game is paused for a few minutes. Please try again shortly.');
      res.json(await arcade.start(w, { ...ctx(req), pay: req.body?.pay === true }));
    }),
  );

  app.post(
    '/api/game/finish',
    gameLimiter,
    play(async (req, res) => {
      const w = await needWallet(req);
      const { attemptId, moves } = req.body ?? {};
      if (typeof attemptId !== 'string' || !UUID.test(attemptId)) throw new Reject(400, 'Unknown game.');
      res.json(await arcade.finish(w, attemptId, moves));
    }),
  );

  app.post(
    '/api/game/abandon',
    gameLimiter,
    play(async (req, res) => {
      const w = await needWallet(req);
      if (typeof req.body?.attemptId !== 'string' || !UUID.test(req.body.attemptId)) throw new Reject(400, 'Unknown game.');
      res.json(await arcade.abandon(w, req.body.attemptId));
    }),
  );

  app.get(
    '/api/game/leaderboard',
    play(async (req, res) => {
      const w = await walletOf(req);
      res.set('Cache-Control', 'no-store');
      res.json(await arcade.leaderboard(w?.region ?? regionOf(req), w));
    }),
  );

  app.post(
    '/api/game/shield',
    walletLimiter,
    play(async (req, res) => res.json(await arcade.buyShield(await needWallet(req), req.body?.blocks))),
  );

  // --- Coin packs: bought with real money through the edition's processor ---
  app.post(
    '/api/coins/orders',
    limiter(6, 'Too many orders. Wait a minute.'),
    play(async (req, res) => {
      if (!config.coinPacks) throw new Reject(404, 'Coins can’t be bought. Earn them by playing, daily bonuses and invites.');
      const w = await needWallet(req);
      const pack = arcade.packOf(w.region, req.body?.pack);
      if (!pack) throw new Reject(400, 'Unknown coin pack.');
      const email = paymentEmail(req, w.region);
      await requireHuman(req);
      const order = await store.createCoinOrder({ walletId: w.id, region: w.region, pack: pack.id, coins: pack.coins, amountCents: pack.priceCents });
      const checkout = await payments.createIntent({
        region: w.region,
        bidId: order.id,
        amountCents: pack.priceCents,
        description: `${pack.coins} Throne coins`,
        email,
        returnPath: '/wallet?paid=1',
      });
      res.status(201).json({
        orderId: order.id,
        coins: pack.coins,
        amountCents: pack.priceCents,
        currency: game.rulesOf(w.region).currency,
        vatPct: game.rulesOf(w.region).vatPct ?? 0,
        paymentsMode: payments.modeFor(w.region),
        ...checkout,
      });
    }),
  );

  app.get(
    '/api/coins/orders/:id',
    play(async (req, res) => {
      const w = await needWallet(req);
      const o = UUID.test(req.params.id) ? await store.getCoinOrder(req.params.id) : null;
      if (!o || o.walletId !== w.id) throw new Reject(404, 'Order not found.');
      res.json({ status: o.status, coins: o.coins });
    }),
  );

  // Demo mode only (never with real money; see config.js).
  app.post(
    '/api/coins/orders/:id/demo-pay',
    play(async (req, res) => {
      const o = UUID.test(req.params.id) ? await store.getCoinOrder(req.params.id) : null;
      if (!o || payments.modeFor(o.region) !== 'demo') return res.status(404).end();
      const r = await arcade.settleCoinOrder(o, `demo_${o.id}`);
      res.json(r);
    }),
  );

}

// --- Admin: moderate everything in the game ---
export function mountArcadeAdmin(admin, deps) {
  const { arcade, store, game, realtime } = deps;
  const UUID = ID;
  const wrap = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
  const loadWallet = async (req, res) => {
    if (!UUID.test(req.params.id)) {
      res.status(404).json({ error: 'Wallet not found.' });
      return null;
    }
    const w = await store.getWallet(req.params.id);
    if (!w) res.status(404).json({ error: 'Wallet not found.' });
    return w;
  };
  const reasonOf = (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 200) {
      res.status(400).json({ error: 'Give a reason (3-200 characters).' });
      return null;
    }
    return reason;
  };
  const adminWallet = (w) => ({
    id: w.id,
    region: w.region,
    playerName: w.playerName,
    displayName: arcade.displayName(w),
    balance: w.balance,
    referralCode: w.referralCode,
    referredBy: w.referredBy,
    referralPaid: w.referralPaid,
    banned: Boolean(w.banned),
    banReason: w.banReason ?? null,
    backedUp: Boolean(w.backedUpAt),
    createdAt: w.createdAt,
  });

  admin.get(
    '/game/wallets',
    wrap(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '';
      res.json({ items: (await store.searchWallets(q, 50)).map(adminWallet) });
    }),
  );

  // One player's full picture: wallet, ledger, games, orders, card, invites.
  admin.get(
    '/game/wallets/:id',
    wrap(async (req, res) => {
      const w = await loadWallet(req, res);
      if (!w) return;
      const [ledger, attempts, orders, card, invites, records] = await Promise.all([
        store.listLedger(w.id, 200),
        store.listAttemptsAdmin({ walletId: w.id, limit: 100 }),
        store.listCoinOrders({ walletId: w.id, limit: 50 }),
        store.getCard(w.id),
        store.listReferrals(w.id),
        store.walletRecords(w.id),
      ]);
      res.json({
        wallet: adminWallet(w),
        records,
        ledger,
        attempts: attempts.map(({ seed: _s, ipHash: _i, deviceHash: _d, ...a }) => a),
        orders,
        card,
        invites,
      });
    }),
  );

  admin.post(
    '/game/wallets/:id/coins',
    wrap(async (req, res) => {
      const w = await loadWallet(req, res);
      if (!w) return;
      const delta = req.body?.delta;
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000_000) return res.status(400).json({ error: 'Delta must be a whole number of coins.' });
      const reason = reasonOf(req, res);
      if (!reason) return;
      try {
        const balance = await store.applyCoins(w.id, delta, 'admin', `admin:${Date.now()}`);
        await store.logAdmin({ action: 'coins', bidId: null, region: w.region, reason: `${delta > 0 ? '+' : ''}${delta} coins to ${w.id}: ${reason}`, undoable: false });
        res.json({ balance });
      } catch (err) {
        if (/insufficient/.test(err.message)) return res.status(409).json({ error: 'That would take the balance below zero.' });
        throw err;
      }
    }),
  );

  admin.post(
    '/game/wallets/:id/ban',
    wrap(async (req, res) => {
      const w = await loadWallet(req, res);
      if (!w) return;
      const banned = req.body?.banned === true;
      const reason = banned ? reasonOf(req, res) : 'unban';
      if (!reason) return;
      await store.setWalletFields(w.id, { banned, banReason: banned ? reason : null });
      await store.logAdmin({ action: banned ? 'ban-wallet' : 'unban-wallet', bidId: null, region: w.region, reason: `${w.id}: ${reason}`, undoable: false });
      res.json({ ok: true });
    }),
  );

  admin.post(
    '/game/wallets/:id/name',
    wrap(async (req, res) => {
      const w = await loadWallet(req, res);
      if (!w) return;
      await store.setWalletFields(w.id, { playerName: null });
      await store.logAdmin({ action: 'reset-name', bidId: null, region: w.region, reason: `${w.id}: ${w.playerName ?? ''}`, undoable: false });
      res.json({ ok: true });
    }),
  );

  // Ad cards waiting for review (Nigeria hold) and any card by wallet.
  admin.get(
    '/game/cards',
    wrap(async (_req, res) => {
      res.json({ items: await store.listCardReviews() });
    }),
  );
  admin.post(
    '/game/cards/:id/approve',
    wrap(async (req, res) => {
      const w = await loadWallet(req, res);
      if (!w) return;
      const card = await store.getCard(w.id);
      if (!card) return res.status(404).json({ error: 'No card.' });
      await store.upsertCard(w.id, { status: 'approved', reason: null });
      await store.logAdmin({ action: 'approve-card', bidId: null, region: w.region, reason: w.id, undoable: false });
      res.json({ ok: true });
    }),
  );
  admin.post(
    '/game/cards/:id/reject',
    wrap(async (req, res) => {
      const w = await loadWallet(req, res);
      if (!w) return;
      const reason = reasonOf(req, res);
      if (!reason) return;
      if (!(await store.getCard(w.id))) return res.status(404).json({ error: 'No card.' });
      await store.upsertCard(w.id, { status: 'rejected', reason });
      await store.logAdmin({ action: 'reject-card', bidId: null, region: w.region, reason: `${w.id}: ${reason}`, undoable: false });
      res.json({ ok: true });
    }),
  );

  // Recent games (filter by status, e.g. too_fast = flagged as automated).
  admin.get(
    '/game/attempts',
    wrap(async (req, res) => {
      const status = ['started', 'solved', 'failed', 'too_fast'].includes(req.query.status) ? req.query.status : null;
      const region = ['global', 'ng'].includes(req.query.region) ? req.query.region : null;
      const items = await store.listAttemptsAdmin({ region, status, limit: 200 });
      res.json({ items: items.map(({ seed: _s, ipHash: _i, deviceHash: _d, ...a }) => a) });
    }),
  );

  // Void a result: it leaves the leaderboard, and if that time holds the
  // Throne the reign is ended (the throne reopens).
  admin.post(
    '/game/attempts/:aid/void',
    wrap(async (req, res) => {
      if (!UUID.test(req.params.aid)) return res.status(404).json({ error: 'Game not found.' });
      const a = await store.getAttempt(req.params.aid);
      if (!a) return res.status(404).json({ error: 'Game not found.' });
      const reason = reasonOf(req, res);
      if (!reason) return;
      await store.voidAttempt(a.id);
      const { bid } = await store.getThrone(a.region);
      let dethroned = false;
      if (bid && bid.walletId === a.walletId && bid.scoreMs === a.durationMs) {
        dethroned = await store.forceRetire(a.region, bid.id);
        realtime.broadcast('retired', { region: a.region, name: bid.name });
      }
      await store.logAdmin({ action: 'void-game', bidId: dethroned ? bid.id : null, region: a.region, reason: `${a.id}: ${reason}`, undoable: false });
      res.json({ ok: true, dethroned });
    }),
  );

  admin.get(
    '/game/orders',
    wrap(async (_req, res) => {
      res.json({ items: await store.listCoinOrders({ limit: 200 }) });
    }),
  );

  void game;
}
