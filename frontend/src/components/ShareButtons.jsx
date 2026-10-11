import { useState } from 'react';
import { Check, Link2, Share2 } from 'lucide-react';
import { formatMs } from '../lib/wallet.js';

// Share a result (or just an invite). The link carries the player's invite
// code, so friends who join earn both of them coins.
export default function ShareButtons({ ms, crowned, rank, referralCode, text: custom }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/${referralCode ? `?ref=${referralCode}` : ''}`;
  const text =
    custom ??
    (crowned
      ? `👑 I took the THRONE in ${formatMs(ms)}! My ad is on the big billboard. Think you're faster?`
      : `I solved today's Throne puzzle in ${formatMs(ms)}${rank ? ` (#${rank} today)` : ''}. Can you beat me?`);
  const enc = encodeURIComponent;
  const links = [
    ['WhatsApp', `https://wa.me/?text=${enc(`${text} ${url}`)}`, 'bg-[#25D366] text-ink'],
    ['X', `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`, 'bg-onyx text-white'],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, 'bg-bh-blue text-white'],
    ['Telegram', `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`, 'bg-[#229ED9] text-white'],
  ];
  return (
    <div className="space-y-2">
      <p className="label flex items-center justify-center gap-1.5">
        <Share2 className="h-4 w-4" strokeWidth={3} /> Share and invite (you both earn coins)
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {links.map(([name, href, cls]) => (
          <a key={name} href={href} target="_blank" rel="noopener noreferrer" className={`btn-sm btn justify-center border-2 border-ink ${cls}`}>
            {name}
          </a>
        ))}
      </div>
      <div className="flex gap-2">
        {typeof navigator !== 'undefined' && navigator.share && (
          <button type="button" className="btn-outline btn-sm flex-1" onClick={() => navigator.share({ text, url }).catch(() => {})}>
            <Share2 className="h-4 w-4" strokeWidth={3} /> More
          </button>
        )}
        <button
          type="button"
          className="btn-outline btn-sm flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${text} ${url}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // clipboard blocked
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" strokeWidth={3} /> : <Link2 className="h-4 w-4" strokeWidth={3} />} {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
