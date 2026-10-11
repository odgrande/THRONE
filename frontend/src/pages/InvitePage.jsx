import { useEffect, useState } from 'react';
import { Check, Copy, Gift, Loader2, Megaphone, Users } from 'lucide-react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import ShareButtons from '../components/ShareButtons.jsx';
import { WalletDialog } from '../components/WalletChip.jsx';
import { coinFmt } from '../components/WalletPanel.jsx';
import { useWallet, walletApi } from '../lib/wallet.js';

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

// The affiliate page: your invite link, who joined through it, and what you
// earned. All from this browser's wallet (no account).
export default function InvitePage() {
  const { wallet, loading } = useWallet();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    walletApi.affiliates().then(setData, (err) => setError(err.message));
  }, [wallet]);

  const link = wallet ? `${window.location.origin}/?ref=${wallet.referralCode}` : '';

  return (
    <div className="min-h-screen bg-canvas">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="label text-bh-blue">Invite & earn</p>
        <h1 className="display mt-2 text-5xl sm:text-6xl">Bring friends. Earn ad time.</h1>
        <p className="mt-3 max-w-2xl font-medium text-ink/75">
          Share your link. When a friend joins and plays their first game, you both get coins. Every few friends who play earns you a free Market stall day, and you get a share of the coins they spend on ads, for as long as they play.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            [Gift, 'Friend plays', wallet ? `+${coinFmt(wallet.coins?.referral)} coins each` : 'Coins for you both'],
            [Megaphone, `Every ${data?.nextMilestone?.every ?? 5} friends`, data ? `A free Market stall day (${coinFmt(data.nextMilestone.rewardCoins)} coins)` : 'A free Market stall day'],
            [Users, 'They book ads', `${data?.rewards?.commissionPct ?? 10}% of their ad coins, to you`],
          ].map(([Icon, k, v]) => (
            <div key={k} className="border-4 border-ink bg-paper p-4 shadow-hard-sm">
              <Icon className="h-6 w-6" strokeWidth={3} />
              <p className="label mt-2">{k}</p>
              <p className="font-bold">{v}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <Loader2 className="mt-10 h-6 w-6 animate-spin" strokeWidth={3} />
        ) : !wallet ? (
          <div className="mt-10 border-4 border-ink bg-bh-yellow p-6">
            <p className="display text-2xl">Start your free wallet to get your invite link</p>
            <button type="button" className="btn-red mt-4" onClick={() => setWalletOpen(true)}>
              Get my link
            </button>
          </div>
        ) : (
          <>
            <section className="mt-10 space-y-4 border-4 border-ink bg-paper p-5">
              <p className="label">Your invite link</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <code className="block flex-1 select-all break-all border-2 border-ink bg-canvas px-3 py-2 font-mono text-sm" data-testid="invite-link">
                  {link}
                </code>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      // clipboard blocked
                    }
                  }}
                >
                  {copied ? <Check className="h-4 w-4" strokeWidth={3} /> : <Copy className="h-4 w-4" strokeWidth={3} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <ShareButtons referralCode={wallet.referralCode} text="Play the free Throne puzzle race and win a spot for your ad on the big billboard. We both get coins:" />
            </section>

            {error && <p className="mt-6 border-2 border-ink bg-bh-red px-3 py-2 font-bold text-white">{error}</p>}
            {data && (
              <>
                <dl className="mt-8 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  {[
                    ['Invited', data.totals.invited],
                    ['Playing', data.totals.qualified],
                    ['Coins earned', coinFmt(data.totals.earnedCoins)],
                    ['Next free day in', `${data.nextMilestone.remaining} friend${data.nextMilestone.remaining === 1 ? '' : 's'}`],
                  ].map(([k, v]) => (
                    <div key={k} className="border-2 border-ink bg-paper p-3">
                      <dt className="label text-ink/60">{k}</dt>
                      <dd className="text-2xl font-black tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-sm text-ink/60">
                  From invites: {coinFmt(data.totals.referralCoins)} · commission: {coinFmt(data.totals.commissionCoins)} · free ad time: {coinFmt(data.totals.adTimeCoins)} coins
                </p>

                <section className="mt-8">
                  <h2 className="display text-3xl">Your friends</h2>
                  {data.friends.length ? (
                    <div className="mt-4 overflow-x-auto border-4 border-ink">
                      <table className="w-full min-w-[480px] text-left text-sm">
                        <thead className="bg-bh-yellow">
                          <tr className="label">
                            <th className="px-3 py-2">Player</th>
                            <th className="px-3 py-2">Joined</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2 text-right">You earned</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-ink/10 bg-paper">
                          {data.friends.map((f, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 font-bold">{f.name}</td>
                              <td className="px-3 py-2">{dateFmt.format(new Date(f.joinedAt))}</td>
                              <td className="px-3 py-2">{f.suspended ? 'Suspended' : f.playing ? 'Playing ✓' : 'Not played yet'}</td>
                              <td className="px-3 py-2 text-right font-black tabular-nums">{coinFmt(f.earnedCoins)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 text-ink/70">No friends yet. Share your link!</p>
                  )}
                </section>
              </>
            )}
          </>
        )}

        <section className="mt-10 border-t-4 border-ink pt-6 text-sm text-ink/70">
          <p className="font-bold text-ink">Fair invites</p>
          <p className="mt-1">
            Rewards count once a friend plays their first game from their own device. Invites from your own devices or network, fake wallets and bots earn nothing and can get a wallet suspended. Coins are play money: no cash value, no cash-out.
          </p>
        </section>
      </main>
      {walletOpen && <WalletDialog onClose={() => setWalletOpen(false)} />}
      <Footer />
    </div>
  );
}
