import { CreditCard, Flag, Mail, Scale } from 'lucide-react';
import InfoPage, { SectionTitle } from '../components/InfoPage.jsx';
import ContactForm from '../components/ContactForm.jsx';
import { OfficialSocials } from '../components/Socials.jsx';

const QUICK = [
  { icon: Flag, title: 'Scam or bad ad?', body: 'Press “Report ad” on the ad itself: it is the fastest way. Several reports hide an ad at once.' },
  { icon: CreditCard, title: 'Payment or refund', body: 'Ads that have gone live are non-refundable; the automatic refunds are listed in the Terms. For a payment problem, tell us the time you paid and the ad’s name (the ad ID is on My ads).' },
  { icon: Scale, title: 'Legal, copyright or your data', body: 'Pick that topic below. Data requests (access or delete) are answered within one month.' },
];

export default function ContactPage() {
  // ?topic=partner etc. preselects the topic (used by links across the site).
  const topic = new URLSearchParams(window.location.search).get('topic') ?? undefined;
  return (
    <InfoPage kicker="Contact" title="Problem? Talk to us." intro="Trouble with an ad, a payment, a scam you spotted, or anything else: send us a message and a real person will answer.">
      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-4">
            <Icon className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
            <p className="mt-2 font-black uppercase tracking-tight">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/75">{body}</p>
          </div>
        ))}
      </div>

      <SectionTitle id="form">Send a message</SectionTitle>
      <ContactForm defaultTopic={topic} />

      <div className="card flex flex-col gap-4 bg-bh-cream p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="label">Or email us</p>
          <a href="mailto:therone@gmail.com" className="mt-1 inline-flex items-center gap-2 text-lg font-black underline hover:text-bh-red">
            <Mail className="h-5 w-5" strokeWidth={3} /> therone@gmail.com
          </a>
          <p className="mt-1 text-xs text-ink/60">Throne is owned and operated by Odgrande NG Limited (RC1029807).</p>
        </div>
        <OfficialSocials />
      </div>
    </InfoPage>
  );
}
