import { CreditCard, Flag, Handshake, Mail, Scale, ShieldAlert } from 'lucide-react';
import InfoPage, { SectionTitle } from '../components/InfoPage.jsx';
import { OfficialSocials } from '../components/Socials.jsx';

const EMAIL = 'therone@gmail.com';
const mail = (subject) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;

// Support is by email for now (a form and WhatsApp can come back as we grow).
// Each topic opens the visitor's email app with a clear subject line.
const TOPICS = [
  { icon: Flag, title: 'A problem with my ad', subject: 'Throne: problem with my ad', body: 'Tell us the ad’s name and roughly when you placed it. The ad ID is on My ads if you bought from this browser.' },
  { icon: CreditCard, title: 'Payment or refund', subject: 'Throne: payment question', body: 'Tell us when you paid and the ad’s name. Ads that have gone live are non-refundable; the automatic refunds are listed in the Terms.' },
  { icon: ShieldAlert, title: 'Report a scam or abuse', subject: 'Throne: report', body: 'The fastest way is the “Report ad” button on the ad itself. Email us for anything else.' },
  { icon: Scale, title: 'Legal, copyright or my data', subject: 'Throne: legal / data request', body: 'Copyright notices and data requests (access or delete). Data requests are answered within one month.' },
  { icon: Handshake, title: 'Partnerships and press', subject: 'Throne: partnership', body: 'Agencies, brands, communities, investors and journalists: tell us who you are and what you have in mind.' },
];

export default function ContactPage() {
  return (
    <InfoPage kicker="Contact" title="Problem? Email us." intro="Trouble with an ad, a payment, a scam you spotted, or anything else: email us and a real person will answer. We aim to reply within 2 working days.">
      <a href={`mailto:${EMAIL}`} className="card flex items-center justify-between gap-3 bg-bh-yellow p-5 hover:-translate-y-0.5">
        <span>
          <span className="label block">Support email</span>
          <span className="mt-1 block break-all text-xl font-black sm:text-2xl">{EMAIL}</span>
        </span>
        <Mail className="h-8 w-8 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      </a>

      <SectionTitle id="topics">What is it about?</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {TOPICS.map(({ icon: Icon, title, subject, body }) => (
          <a key={title} href={mail(subject)} className="card block p-4 transition duration-200 hover:-translate-y-0.5">
            <Icon className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
            <p className="mt-2 font-black uppercase tracking-tight">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/75">{body}</p>
            <p className="label mt-3 text-bh-blue">Email us about this →</p>
          </a>
        ))}
      </div>

      <div className="card flex flex-col gap-4 bg-bh-cream p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">
          Never send card details, PINs or passwords by email. Throne will never ask for them.
        </p>
        <OfficialSocials />
      </div>
    </InfoPage>
  );
}
