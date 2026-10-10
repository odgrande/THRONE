import { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { t } from '../lib/i18n.js';

// Bumped when the notice gains the advertiser disclaimer, so everyone sees it once.
const KEY = 'throne.notice.v2';
const seen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

// One small notice, shown once per browser: who the ads come from (we are not
// affiliated with any advertiser), and that we set no tracking cookies.
// The site only keeps a few functional items in the browser. That needs a
// notice, not a consent wall. If analytics or ad-tracking scripts are ever
// added, this must become a real opt-in that blocks them until the visitor agrees.
export default function CookieNotice() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Storage blocked: the notice will show again next visit.
    }
    setOpen(false);
  };

  return (
    <aside
      aria-label={t('notice.label')}
      className="fixed bottom-4 left-4 right-4 z-40 border-2 border-ink bg-paper p-4 shadow-hard-sm sm:right-auto sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-bh-red" strokeWidth={2.5} />
        <div className="space-y-2 text-sm font-medium leading-relaxed">
          <p>
            <span className="font-bold">{t('notice.title')}</span> {t('notice.body')}
          </p>
          <p className="text-ink/70">
            <span className="font-bold text-ink">{t('cookie.title')}</span> {t('cookie.body')}{' '}
            <a href="/legal#terms" className="font-bold text-ink underline hover:text-bh-red">
              {t('cookie.details')}
            </a>
          </p>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('notice.dismiss')} className="shrink-0 hover:text-bh-red">
          <X className="h-4 w-4" strokeWidth={3} />
        </button>
      </div>
      <button type="button" onClick={dismiss} className="btn-yellow btn-sm mt-3 w-full">
        {t('cookie.ok')}
      </button>
    </aside>
  );
}
