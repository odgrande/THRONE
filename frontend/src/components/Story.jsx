import { ArrowRight } from 'lucide-react';
import { t } from '../lib/i18n.js';

// Why Throne exists: the Million Dollar Homepage (2005) sold a million static
// pixels at $1 each. Throne keeps the idea (anyone can buy a spot on one
// famous page) and makes it live and competitive.
const PIXELS = Array.from({ length: 48 }, (_, i) => ['bg-bh-red', 'bg-bh-blue', 'bg-bh-yellow', 'bg-white'][(i * 7 + (i >> 3)) % 4]);

export default function Story() {
  return (
    <section className="border-b-4 border-ink bg-onyx text-white" aria-labelledby="story-title">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:px-8 lg:py-16">
        <div>
          <p className="label text-bh-yellow">{t('story.kicker')}</p>
          <h2 id="story-title" className="display mt-3 text-4xl sm:text-5xl">
            {t('story.title')}
          </h2>
          <p className="mt-4 max-w-xl font-medium leading-relaxed text-white/80">{t('story.body1')}</p>
          <p className="mt-3 max-w-xl font-medium leading-relaxed text-white/80">{t('story.body2')}</p>
        </div>
        {/* 2005: a page of frozen pixels -> today: one live billboard. */}
        <div className="flex items-center justify-center gap-4 sm:gap-6" aria-hidden="true">
          <div className="text-center">
            <div className="grid grid-cols-8 gap-0.5 border-2 border-white p-1">
              {PIXELS.map((c, i) => (
                <span key={i} className={`h-3 w-3 sm:h-4 sm:w-4 ${c}`} />
              ))}
            </div>
            <p className="label mt-2 text-white/60">2005 · {t('story.static')}</p>
          </div>
          <ArrowRight className="h-8 w-8 shrink-0 text-bh-yellow" strokeWidth={3} />
          <div className="text-center">
            <div className="relative flex h-[7.5rem] w-40 items-center justify-center border-4 border-white bg-bh-red sm:h-[9.5rem] sm:w-52">
              <span className="absolute -top-3 left-3 bg-bh-yellow px-1.5 text-[10px] font-black uppercase text-ink">Live</span>
              <span className="display text-center text-xl leading-none">{t('story.yourAd')}</span>
            </div>
            <p className="label mt-2 text-white/60">{t('story.today')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
