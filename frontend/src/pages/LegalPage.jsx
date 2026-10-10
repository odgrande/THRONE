import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';

// DRAFT legal texts. They describe how the product actually works so a lawyer
// can start from facts. Fill every [BRACKETED] placeholder and have counsel
// review before launch (and again for the Nigeria edition: NDPA 2023).
const OPERATOR = '[COMPANY NAME]';
const CONTACT = '[CONTACT EMAIL]';
const ADDRESS = '[REGISTERED ADDRESS]';
const LAW = '[GOVERNING LAW / COUNTRY]';

const SECTIONS = [
  {
    id: 'terms',
    title: 'Terms of Service',
    body: [
      `Project Throne is operated by ${OPERATOR} ("we"). By using the site or placing a bid you agree to these terms.`,
      'How it works. Anyone can place an ad on the billboard by paying at least the minimum price shown. A higher qualifying payment replaces the current ad immediately. There are no accounts; you are responsible for the content you submit.',
      'Payments are final. A bid is a purchase of display time, which ends when someone outbids you, and is not refundable, except: (a) if another payment cleared first and your bid no longer met the minimum, we refund it automatically in full; (b) where the law requires a refund.',
      'Content rules. Your ad must follow the Ad Policy below. Ads are screened automatically before payment, but passing screening is not approval. We may remove any ad at any time, without refund, if it breaks these terms or the law. A removed ad keeps its slot until outbid but its content is hidden.',
      'King of the Day is a title with no cash or prize value.',
      `Liability. The service is provided "as is". We do not endorse ads or the sites they link to. To the extent the law allows, our total liability to you is limited to the amount you paid in the 30 days before the claim.`,
      `These terms are governed by the laws of ${LAW}. Questions: ${CONTACT}.`,
    ],
  },
  {
    id: 'ad-policy',
    title: 'Ad Policy',
    body: [
      'Not allowed: scams, phishing, malware or misleading links; sexual or adult content; content involving minors in any harmful way; hate, harassment or threats; violence or dangerous activities; illegal goods or services; gambling where unlicensed; impersonation of people or brands; content you do not have the rights to use; political ads [DECIDE: allowed or not].',
      'Links must lead where the ad says they do. Every outbound click shows visitors the destination before they leave.',
      'Anyone can report an ad. Ads reported by several different people may be hidden at once while we review them.',
    ],
  },
  {
    id: 'credits',
    title: 'Throne Credits',
    body: [
      'When your ad is replaced, you may receive Throne Credits worth a percentage of the new bid. Credits can only be used toward future bids on this site.',
      'Credits are not money, have no cash value, cannot be sold or transferred, and are not redeemable for cash [unless and until a cash-out feature is launched under separate terms].',
      'Credits are stored against a private code kept in your browser. If you clear your browser data without backing up the code, the credits cannot be recovered. [DECIDE: do credits expire? e.g. after 12 months of inactivity]',
      'We may cancel credits obtained through fraud, abuse or a technical error.',
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    body: [
      'What we collect: the ad you submit (name, tagline, image, link); the amount and time of each bid; a hashed (scrambled) version of your Throne Credits code; a salted hash of the IP address of anyone who reports an ad (used only to count each person once); and short-lived IP-based counters to stop abuse.',
      'No accounts and no tracking cookies. Your browser stores your Throne Credits code locally (localStorage) so you can spend your credits.',
      'Payments are processed by Stripe. We never see or store full card numbers.',
      'Service providers who receive data to run the site: Stripe (payments), Supabase (database and file storage), Cloudflare (security, bot checks and delivery), OpenAI (automated content screening of submitted ads), Google Web Risk (checking submitted links), and Render (hosting).',
      'Your ad is public. It is shown on the billboard and kept in the public History of Kings archive. You can ask us to remove an ad you placed.',
      `Your rights: you can ask to access or delete information about you, subject to records we must keep (for example payment records). Contact ${CONTACT}. [ADD: jurisdiction-specific rights, e.g. GDPR / NDPA 2023, data controller details]`,
    ],
  },
  {
    id: 'copyright',
    title: 'Copyright & Takedowns',
    body: [
      'If an ad uses your copyright, trademark or likeness without permission, use the Report button on the ad (choose "Uses my copyright or trademark") for the fastest response.',
      `For a formal notice, email ${CONTACT} or write to ${ADDRESS} with: your contact details; the work you own; a link to the ad on our site; a statement that you believe in good faith the use is not authorised; a statement that your notice is accurate and that you are the owner or authorised to act for them; and your signature.`,
      'We act promptly on valid notices, and we may remove repeat infringers\' ads without notice.',
    ],
  },
];

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <Header />
      <p className="border-b-4 border-ink bg-bh-yellow px-4 py-3 text-center text-sm font-black uppercase tracking-wider">
        Draft · for legal review before launch · not legal advice
      </p>
      <main className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8 lg:py-16">
        <nav aria-label="Legal sections" className="h-fit lg:sticky lg:top-8">
          <p className="label mb-3">On this page</p>
          <ul className="space-y-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="font-bold hover:text-bh-red">{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-10">
          <h1 className="display text-5xl sm:text-7xl">The rules</h1>
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="card scroll-mt-8 p-6 lg:p-8">
              <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{s.title}</h2>
              <div className="mt-4 max-w-3xl space-y-3 font-medium leading-relaxed">
                {s.body.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
