import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatMoney } from '../lib/api.js';
import { getWalletToken, setWalletToken } from '../lib/wallet.js';

// Throne Credits: no account, so the balance lives behind a secret code in this
// browser. Copying the code is the only way to move it to another device.
export default function CreditsPanel({ wallet, onRestore }) {
  const [copied, setCopied] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [code, setCode] = useState('');
  const token = getWalletToken();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your Throne Credits code:', token);
    }
  };

  const restore = (e) => {
    e.preventDefault();
    setWalletToken(code.trim());
    setRestoring(false);
    setCode('');
    onRestore();
  };

  return (
    <div className="mt-6 border-t-2 border-ink pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="label text-ink/60">Throne Credits</p>
          <p className="text-2xl font-black tabular-nums">{formatMoney(wallet?.balanceCents ?? 0)}</p>
        </div>
        <span className="flex h-12 w-12 rotate-45 items-center justify-center border-2 border-ink bg-bh-yellow">
          <span className="-rotate-45 text-lg font-black">C</span>
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink/60">
        Earned when you're knocked off. Spend them on your next bid.{' '}
        {wallet?.cashoutEnabled
          ? `Cash out from ${formatMoney(wallet.cashoutMinCents)}.`
          : `Cash-out from ${formatMoney(wallet?.cashoutMinCents ?? 2000)} is coming soon.`}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {token && (
          <button type="button" onClick={copy} className="label inline-flex items-center gap-1.5 hover:text-bh-red">
            {copied ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Copy className="h-3.5 w-3.5" strokeWidth={3} />}
            {copied ? 'Copied' : 'Back up code'}
          </button>
        )}
        <button type="button" onClick={() => setRestoring(!restoring)} className="label hover:text-bh-red">
          Use code from another device
        </button>
      </div>

      {restoring && (
        <form onSubmit={restore} className="mt-3 flex gap-2">
          <input
            className="field py-2 font-mono text-xs"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste your credits code"
            aria-label="Throne Credits code"
            pattern="[A-Za-z0-9_\-]{43}"
            required
          />
          <button type="submit" className="btn-outline btn-sm">Load</button>
        </form>
      )}
    </div>
  );
}
