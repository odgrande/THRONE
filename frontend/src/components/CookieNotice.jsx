import { useState } from 'react';
import { Cookie, X } from 'lucide-react';
import { t } from '../lib/i18n.js';

const KEY = 'throne.cookieNotice';
const seen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

// A small, honest notice. The site sets no tracking or advertising cookies;
// it only keeps a few functional items in the browser. That needs a notice,
// not a consent wall. If analytics or ad-tracking scripts are ever added, this
// must become a real opt-in that blocks them until the visitor agrees.
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
      aria-label="Cookie notice"
      className="fixed bottom-4 left-4 right-4 z-40 border-2 border-ink bg-paper p-4 shadow-hard-sm sm:right-auto sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.5} />
        <p className="text-sm font-medium leading-relaxed">
          <span className="font-bold">{t('cookie.title')}</span> {t('cookie.body')}{' '}
          <a href="/legal#privacy" className="font-bold underline hover:text-bh-red">
            {t('cookie.details')}
          </a>
        </p>
        <button type="button" onClick={dismiss} aria-label="Dismiss cookie notice" className="shrink-0 hover:text-bh-red">
          <X className="h-4 w-4" strokeWidth={3} />
        </button>
      </div>
      <button type="button" onClick={dismiss} className="btn-yellow btn-sm mt-3 w-full">
        {t('cookie.ok')}
      </button>
    </aside>
  );
}
