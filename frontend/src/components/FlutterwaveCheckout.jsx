import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { t } from '../lib/i18n.js';

// Flutterwave Standard: the buyer pays on Flutterwave's own page (cards never
// touch our site). It opens in a new tab; this page keeps waiting and updates
// as soon as Flutterwave confirms the payment to our server.
export default function FlutterwaveCheckout({ authorizationUrl, label, onPaid }) {
  const [opened, setOpened] = useState(false);
  return (
    <div className="space-y-3">
      {opened ? (
        <p className="flex items-center justify-center gap-2 border-2 border-ink bg-bh-cream px-3 py-3 text-center text-sm font-bold">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={3} /> {t('flw.waiting')}
        </p>
      ) : null}
      <a
        href={authorizationUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          setOpened(true);
          onPaid();
        }}
        className="btn w-full bg-onyx text-white hover:bg-onyx/90"
      >
        {opened ? t('flw.reopen') : label} <ExternalLink className="h-4 w-4" strokeWidth={3} />
      </a>
      <p className="text-center text-xs text-ink/60">{t('flw.secured')}</p>
    </div>
  );
}
