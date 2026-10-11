import { useEffect, useState } from 'react';
import { Eye, Loader2, MousePointerClick } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { ownedAds } from '../lib/owned.js';
import { t } from '../lib/i18n.js';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Shape from '../components/Shape.jsx';

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const STATUS = {
  won: { key: 'my.status.live', tone: 'bg-bh-yellow' },
  review: { key: 'my.status.review', tone: 'bg-bh-cream' },
  pending: { key: 'my.status.unpaid', tone: 'bg-muted' },
  outbid: { key: 'my.status.refunded', tone: 'bg-muted' },
  refunded: { key: 'my.status.refunded', tone: 'bg-muted' },
  void: { key: 'my.status.refunded', tone: 'bg-muted' },
};

// Private results for the ads this browser bought. The owner codes saved at
// purchase prove ownership; nothing else (no account) is needed.
export default function MyAdsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ads = ownedAds().map(({ bidId, token }) => ({ bidId, token }));
    if (!ads.length) return setItems([]);
    api.myAds(ads).then(
      (r) => setItems(r.items.filter((i) => i.status !== 'pending')),
      (err) => setError(err.message),
    );
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="label text-bh-blue">{t('my.kicker')}</p>
        <h1 className="display mt-2 text-5xl sm:text-6xl">{t('my.title')}</h1>
        <p className="mt-3 max-w-2xl font-medium text-ink/75">{t('my.body')}</p>
        {new URLSearchParams(window.location.search).get('paid') && (
          <p className="mt-4 border-2 border-ink bg-bh-yellow px-4 py-3 font-bold">{t('my.paidReturn')}</p>
        )}

        {!items ? (
          <p className="label mt-10 flex items-center gap-2">
            {error ?? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> {t('my.loading')}
              </>
            )}
          </p>
        ) : items.length === 0 ? (
          <div className="card mt-10 flex items-center gap-4 p-6">
            <Shape kind="circle" color="yellow" className="h-8 w-8 border-2 border-ink" />
            <p className="font-bold">
              {t('my.empty')}{' '}
              <a href="/" className="underline hover:text-bh-red">
                {t('my.emptyLink')}
              </a>
            </p>
          </div>
        ) : (
          <ul className="mt-10 space-y-4">
            {items.map((ad) => {
              const status = STATUS[ad.status] ?? STATUS.won;
              const ended = ad.status === 'won' && ad.endsAt && Date.parse(ad.endsAt) < Date.now();
              return (
                <li key={ad.id} className="card grid gap-4 p-4 sm:grid-cols-[140px_1fr_auto] sm:items-center">
                  <div className="aspect-video overflow-hidden border-2 border-ink bg-onyx">
                    {ad.imageUrl ? (
                      <img src={ad.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-bh-red p-2 text-center text-xs font-black uppercase text-white">{ad.tagline || ad.name}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xl font-black uppercase tracking-tight">{ad.name}</p>
                    <p className="text-sm text-ink/70">
                      {ad.boardName} · {formatMoney(ad.paidCents, ad.region)} · {dateFmt.format(new Date(ad.settledAt ?? ad.createdAt))}
                    </p>
                    <span className={`label mt-2 inline-block border-2 border-ink px-2 py-0.5 ${status.tone}`}>
                      {ad.removed ? t('my.status.removed') : ended ? t('my.status.ended') : t(status.key)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-1 border-2 border-ink bg-ink text-center">
                    <div className="bg-paper px-4 py-2">
                      <dt className="label flex items-center justify-center gap-1 text-[10px] text-ink/60">
                        <Eye className="h-3 w-3" strokeWidth={3} /> {t('my.reach')}
                      </dt>
                      <dd className="text-2xl font-black tabular-nums">{ad.views.toLocaleString()}</dd>
                    </div>
                    <div className="bg-paper px-4 py-2">
                      <dt className="label flex items-center justify-center gap-1 text-[10px] text-ink/60">
                        <MousePointerClick className="h-3 w-3" strokeWidth={3} /> {t('my.clicks')}
                      </dt>
                      <dd className="text-2xl font-black tabular-nums">{ad.clicks.toLocaleString()}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-8 text-xs text-ink/60">{t('my.howCounted')}</p>
      </main>
      <Footer />
    </div>
  );
}
