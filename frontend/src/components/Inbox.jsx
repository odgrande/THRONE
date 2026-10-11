import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Mail, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { TOPICS } from './ContactForm.jsx';

const timeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// Messages from the contact and partners forms. Deleted automatically after
// 90 days; delete sooner once answered if you no longer need them.
export default function Inbox({ token }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('open');

  const load = useCallback(async () => {
    try {
      setItems((await api.adminInbox(token)).items);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, action) => {
    try {
      await api.adminInboxAction(token, id, action);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!items) return <p className="label mt-8 flex items-center gap-2">{error ?? <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> Loading inbox</>}</p>;
  const shown = items.filter((m) => (filter === 'open' ? !m.handledAt : filter === 'done' ? m.handledAt : true));

  return (
    <section className="mt-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-4xl">Inbox</h2>
          <p className="mt-1 text-sm text-ink/70">Contact, partner and investor messages. Deleted automatically after 90 days.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter">
          {[
            ['open', `Open (${items.filter((m) => !m.handledAt).length})`],
            ['done', 'Answered'],
            ['all', 'All'],
          ].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`${filter === k ? 'btn-yellow' : 'btn-outline'} btn-sm`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
      {shown.length === 0 ? (
        <p className="card p-5 font-bold">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((m) => (
            <li key={m.id} className={`card p-4 sm:p-5 ${m.handledAt ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="label text-bh-red">
                  {TOPICS[m.topic] ?? m.topic} · {m.region === 'ng' ? 'Nigeria' : 'Global'}
                </p>
                <p className="text-xs text-ink/60">{timeFmt.format(new Date(m.at))}</p>
              </div>
              <p className="mt-1 font-black">
                {m.name || 'No name'}
                {m.company && <span className="font-medium text-ink/70"> · {m.company}</span>}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words font-medium leading-relaxed">{m.message}</p>
              {m.adId && <p className="mt-2 break-all font-mono text-xs text-ink/60">Ad: {m.adId}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Throne')}`} className="btn-blue btn-sm">
                  <Mail className="h-4 w-4" strokeWidth={3} /> Reply to {m.email}
                </a>
                <button type="button" onClick={() => act(m.id, 'handled')} className="btn-outline btn-sm">
                  <Check className="h-4 w-4" strokeWidth={3} /> {m.handledAt ? 'Mark open' : 'Mark answered'}
                </button>
                <button type="button" onClick={() => act(m.id, 'delete')} className="btn-outline btn-sm" aria-label="Delete message">
                  <Trash2 className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
