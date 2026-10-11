import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, CircleDashed, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { API_URL } from '../lib/api.js';
import InfoPage, { SectionTitle } from '../components/InfoPage.jsx';

// Safety & Security: what protects buyers and visitors, stated plainly, with
// the live status of the protections that depend on outside services.
const NEVER_STORED = [
  ['Card numbers and bank details', 'You pay on Paystack’s (Nigeria) or Flutterwave’s (Global) own secure checkout, both PCI DSS certified. We never see your card or bank details.'],
  ['Passwords and accounts', 'There are no accounts, so there is no password to steal.'],
  ['Your receipt email', 'The payment provider needs it to send your receipt. We pass it straight to them and do not keep it.'],
  ['Your IP address', 'For visitor counts we turn it into a scrambled code with a secret that changes every day. The code stays in memory and is never written down.'],
  ['Tracking cookies, ad trackers, analytics', 'None. We do not follow you around the internet or sell anything about you.'],
];

const KEPT = [
  'The ad you publish (it is public on the billboard and in the archive).',
  'The amount and time of your purchase, and the version of the rules you accepted.',
  'A scrambled copy of your private owner code, so only your browser can see your ad’s results.',
  'Messages you send us through the contact form, kept only to answer you and deleted after 90 days.',
];

const ANTI_FRAUD = [
  ['Bot check before every purchase', 'Automated scripts and card-testing bots are stopped before they reach checkout.', 'botCheck'],
  ['Every link checked for malware and phishing', 'Links are checked against Google Web Risk before payment. Unsafe links are blocked and never charged.', 'linkChecks'],
  ['AI screening of every ad', 'Text and pictures are screened before payment for scams, adult content, hate and violence.', 'moderation'],
  ['Political and advocacy ads blocked', 'Checked automatically before payment, and reportable by anyone.'],
  ['People review videos', 'Every video ad is watched by a member of our team before it goes live.'],
  ['Every Nigerian ad is held for review', 'In the Nigeria edition each ad waits about 5 minutes in our review queue before it goes live.'],
  ['A safety page before every click-out', 'Clicking an ad first shows you exactly where you are going, so you are never sent somewhere blindly.'],
  ['Reports act fast', 'Anyone can report an ad. When several different people report one, it is hidden at once until we review it.'],
  ['Payments cannot be faked', 'An ad only goes live when Paystack or Flutterwave itself confirms the payment: we check their signed message, then ask them directly.'],
];

const SITE = [
  'HTTPS everywhere: everything you send is encrypted.',
  'Strict content security policy: only our own code and our payment provider’s checkout can run on the page.',
  'Protection against clickjacking and fake overlays.',
  'Cloudflare network protection against attacks and floods of traffic.',
  'Rate limits on every form, upload and payment step.',
  'Video uploads are checked (type, size, length) and unused files are deleted.',
  'Admin access needs a long secret key, and every admin action is recorded in an audit log.',
];

const TIPS = [
  'Throne will never ask you for your card PIN, OTP or password, by phone, chat or email.',
  'Throne will never ask you to pay anywhere except the checkout on this site.',
  'We are not affiliated with any advertiser. Check a business before you pay it.',
  'See something wrong? Press “Report ad” on it, or contact us.',
];

function Card({ icon: Icon, title, children, tone = 'bg-paper' }) {
  return (
    <section className={`card p-5 sm:p-6 ${tone}`}>
      <h3 className="flex items-center gap-2 text-lg font-black uppercase tracking-tight sm:text-xl">
        <Icon className="h-5 w-5 shrink-0" strokeWidth={3} /> {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function SafetyPage() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then(setHealth, () => {});
  }, []);
  const status = (key) => {
    if (!key) return 'on';
    if (!health) return 'unknown';
    return health[key] ? 'on' : 'setup';
  };
  const live = ANTI_FRAUD.filter(([, , key]) => status(key) === 'on').length;

  return (
    <InfoPage
      kicker="Safety & security"
      title="Built to keep scammers out."
      intro="Every ad is checked before anyone pays, payments can’t be faked, and we keep almost nothing about you. Here is exactly how."
    >
      <section className="card flex flex-col gap-4 bg-bh-yellow p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="label">Protection level</p>
          <p className="display mt-1 text-3xl sm:text-4xl">
            {live} of {ANTI_FRAUD.length} anti-fraud checks active
          </p>
          <p className="mt-1 text-sm font-medium">Shown live from our servers.{health?.payments?.ng === 'demo' || health?.payments?.global === 'demo' ? ' This is a test site: payments are simulated.' : ''}</p>
        </div>
        <ShieldCheck className="h-16 w-16 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      </section>

      <SectionTitle id="fraud">How we stop scams and fraud</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ANTI_FRAUD.map(([title, body, key]) => {
          const s = status(key);
          return (
            <li key={title} className="card flex gap-3 p-4">
              {s === 'on' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-bh-blue" strokeWidth={3} aria-label="Active" />
              ) : (
                <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-ink/40" strokeWidth={3} aria-label="Being set up" />
              )}
              <div>
                <p className="font-black">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink/75">{body}</p>
                {s === 'setup' && <p className="label mt-1 text-ink/50">Being set up on this server</p>}
              </div>
            </li>
          );
        })}
      </ul>

      <SectionTitle id="data">What we never store</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {NEVER_STORED.map(([title, body]) => (
          <div key={title} className="card flex gap-3 p-4">
            <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-bh-red" strokeWidth={3} aria-hidden="true" />
            <div>
              <p className="font-black">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink/75">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <Card icon={Lock} title="The little we do keep">
        <ul className="space-y-1.5 text-sm leading-relaxed">
          {KEPT.map((k) => (
            <li key={k} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-ink" aria-hidden="true" />
              {k}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          Your rights over this data are in the{' '}
          <a href="/legal#data-rights" className="font-bold underline hover:text-bh-red">
            Privacy Policy
          </a>
          .
        </p>
      </Card>

      <SectionTitle id="site">How the site is protected</SectionTitle>
      <Card icon={ShieldCheck} title="Security of the platform">
        <ul className="space-y-1.5 text-sm leading-relaxed">
          {SITE.map((k) => (
            <li key={k} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-bh-blue" strokeWidth={3} aria-hidden="true" />
              {k}
            </li>
          ))}
        </ul>
      </Card>

      <SectionTitle id="tips">Stay safe</SectionTitle>
      <Card icon={Ban} title="Throne will never…" tone="bg-bh-cream">
        <ul className="space-y-1.5 text-sm font-medium leading-relaxed">
          {TIPS.map((k) => (
            <li key={k} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-bh-red" aria-hidden="true" />
              {k}
            </li>
          ))}
        </ul>
        <a href="/contact" className="btn-red btn-sm mt-4 inline-flex">
          Report a problem
        </a>
      </Card>
    </InfoPage>
  );
}
