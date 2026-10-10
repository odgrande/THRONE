import { BadgeCheck } from 'lucide-react';
import { t } from '../lib/i18n.js';

// Official social accounts. Set the full profile URLs at build time
// (frontend/.env or the Cloudflare Pages settings). Only the ones you set are
// shown, so the site never links to an account that isn't ours.
const ACCOUNTS = [
  { id: 'x', label: 'X', url: import.meta.env.VITE_SOCIAL_X },
  { id: 'tiktok', label: 'TikTok', url: import.meta.env.VITE_SOCIAL_TIKTOK },
  { id: 'instagram', label: 'Instagram', url: import.meta.env.VITE_SOCIAL_INSTAGRAM },
  { id: 'linkedin', label: 'LinkedIn', url: import.meta.env.VITE_SOCIAL_LINKEDIN },
  { id: 'facebook', label: 'Facebook', url: import.meta.env.VITE_SOCIAL_FACEBOOK },
].filter((a) => /^https:\/\//.test(a.url ?? ''));

// Brand marks, drawn inline (no third-party scripts or icon fonts).
function Mark({ id }) {
  const common = { viewBox: '0 0 24 24', className: 'h-4 w-4', 'aria-hidden': true, fill: 'currentColor' };
  switch (id) {
    case 'x':
      return (
        <svg {...common}>
          <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg {...common}>
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg {...common}>
          <rect x="3.5" y="9" width="3.6" height="11.5" />
          <circle cx="5.3" cy="5.3" r="2.1" />
          <path d="M9.8 9h3.4v1.6c.5-.9 1.7-1.9 3.6-1.9 3.6 0 4.3 2.4 4.3 5.4v6.4h-3.6v-5.6c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.7H9.8z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...common}>
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
        </svg>
      );
    default:
      return null;
  }
}

// "✓ Official" pill + round icon buttons.
export function OfficialSocials({ className = '' }) {
  if (!ACCOUNTS.length) return null;
  return (
    <nav aria-label="Official social accounts" className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-3 py-1 text-xs font-black uppercase tracking-wider">
        <BadgeCheck className="h-4 w-4 text-bh-blue" strokeWidth={2.5} aria-hidden="true" /> {t('socials.official')}
      </span>
      {ACCOUNTS.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer me"
          aria-label={`Throne on ${a.label}`}
          title={a.label}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-paper transition duration-200 hover:-translate-y-0.5 hover:bg-bh-yellow hover:text-ink"
        >
          <Mark id={a.id} />
        </a>
      ))}
    </nav>
  );
}
