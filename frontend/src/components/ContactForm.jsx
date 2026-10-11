import { useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile.jsx';

export const TOPICS = {
  ad: 'A problem with my ad',
  payment: 'Payment or refund',
  abuse: 'Report a scam or abuse',
  legal: 'Legal or copyright',
  data: 'My data (access or delete)',
  partner: 'Partnership',
  investor: 'Investment',
  press: 'Press',
  other: 'Something else',
};

// One form for contact, partners and investors. Protected by the bot check,
// a hidden honeypot field, rate limits and size caps on the server.
export default function ContactForm({ topics = Object.keys(TOPICS), defaultTopic, withCompany = false }) {
  const [form, setForm] = useState({ topic: defaultTopic ?? topics[0], name: '', email: '', company: '', message: '', adId: '', website: '' });
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState(null);
  const [botToken, setBotToken] = useState(null);
  const turnstileRef = useRef(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const waiting = Boolean(TURNSTILE_SITE_KEY) && !botToken;

  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await api.contact({ ...form, turnstileToken: botToken });
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('idle');
    } finally {
      turnstileRef.current?.reset();
    }
  };

  if (state === 'sent') {
    return (
      <div className="card flex items-start gap-3 bg-bh-yellow p-5">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" strokeWidth={3} />
        <div>
          <p className="text-lg font-black uppercase">Message received</p>
          <p className="mt-1 font-medium">We aim to reply within 2 working days, to the email you gave us.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6">
      <label className="block">
        <span className="label mb-1.5 block">Topic</span>
        <select className="field" value={form.topic} onChange={(e) => set({ topic: e.target.value })}>
          {topics.map((k) => (
            <option key={k} value={k}>
              {TOPICS[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1.5 block">Your name (optional)</span>
          <input className="field" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoComplete="name" />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Email (so we can reply)</span>
          <input className="field" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} maxLength={254} required autoComplete="email" inputMode="email" />
        </label>
      </div>
      {withCompany && (
        <label className="block">
          <span className="label mb-1.5 block">Company or fund (optional)</span>
          <input className="field" value={form.company} onChange={(e) => set({ company: e.target.value })} maxLength={120} autoComplete="organization" />
        </label>
      )}
      {['ad', 'payment', 'abuse'].includes(form.topic) && (
        <label className="block">
          <span className="label mb-1.5 block">Ad ID (optional, from My ads or the ad’s link)</span>
          <input className="field" value={form.adId} onChange={(e) => set({ adId: e.target.value })} maxLength={36} placeholder="e.g. 3f2c…" />
        </label>
      )}
      <label className="block">
        <span className="label mb-1.5 flex justify-between">
          Message <span className="text-ink/50">{form.message.length}/4000</span>
        </span>
        <textarea className="field min-h-[140px]" value={form.message} onChange={(e) => set({ message: e.target.value })} minLength={10} maxLength={4000} required />
      </label>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <label className="hidden" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set({ website: e.target.value })} />
      </label>
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
      <Turnstile ref={turnstileRef} onToken={setBotToken} />
      <button type="submit" disabled={state === 'sending' || waiting} className="btn-red w-full sm:w-auto">
        {state === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} /> : 'Send message'}
      </button>
      <p className="text-xs text-ink/60">
        We keep your message only to answer it and delete it after 90 days. Never send card details, PINs or passwords. See the{' '}
        <a href="/legal#privacy" className="font-bold underline">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
