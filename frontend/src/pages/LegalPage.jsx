import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';

// Live legal texts, reviewed by counsel (October 2026). They describe how the
// product actually works: if a feature changes, update the matching section
// and LAST_UPDATED, and have counsel re-check the change.
const LAST_UPDATED = '10 October 2026';
const OPERATOR = '[COMPANY NAME]';
const CONTACT = 'therone@gmail.com';
const ADDRESS = '[REGISTERED ADDRESS]';
const LAW = '[GOVERNING LAW / COUNTRY]';

const SECTIONS = [
  {
    id: 'terms',
    title: 'Terms of Service',
    body: [
      `Project Throne is operated by ${OPERATOR} ("we"). By using the site or placing a bid you agree to these terms.`,
      'How it works. There are no accounts; you are responsible for the content you submit. You can buy ad space two ways:',
      'The Throne (auction). Pay at least the minimum price shown. A higher qualifying payment replaces the current ad immediately. A king that is not outbid retires automatically after the maximum term (currently 7 days). Display time on the Throne is not guaranteed: it ends when you are outbid or your term ends.',
      'Board bookings (fixed price). Book a smaller board for 1, 3 or 7 days. Your ad runs for the full period you paid for, starting at the next free slot on that board at the moment your payment clears, and cannot be displaced by other advertisers.',
      'Relegation. If your Throne ad is outbid, you may, within 24 hours, move the same ad to a smaller board for one day at a discount, at the next free slot. Dethroned ads are also shown free for 24 hours in a "Recently dethroned" list.',
      'Payments are final, except: (a) if another payment cleared first and your Throne bid no longer met the minimum, or a relegation was already used, we refund it automatically in full; (b) where the law requires a refund.',
      'Content rules. Your ad must follow the Ad Policy below. Ads are screened automatically before payment, but passing screening is not approval. We may remove any ad at any time, without refund, if it breaks these terms or the law. A removed ad keeps its slot but its content is hidden.',
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
    id: 'privacy',
    title: 'Privacy Policy',
    body: [
      'What we collect: the ad you submit (name, tagline, image, link, and the business address if you buy the map add-on); which edition you used (Global or Nigeria, picked from your country as reported by Cloudflare, which you can change); the amount and time of each purchase; a hashed (scrambled) version of a private owner code for each ad; a salted hash of the IP address of anyone who reports an ad (used only to count each person once); and short-lived IP-based counters to stop abuse.',
      'No accounts and no tracking cookies. Your browser keeps the owner codes for ads you bought (localStorage), so it can offer you a relegation if your Throne ad is outbid.',
      'Payments are processed by Paystack (Nigeria, in Naira) and [GLOBAL PROCESSOR, e.g. Stripe] (elsewhere). We never see or store card numbers or bank details.',
      'Email for payment receipts. Paystack requires an email address to send your receipt. We pass the email you type straight to Paystack and do not store it ourselves.',
      'Service providers who receive data to run the site: Paystack and [GLOBAL PROCESSOR] (payments), Supabase (database and file storage), Cloudflare (security, bot checks and delivery), OpenAI (automated content screening of submitted ads), Google Web Risk (checking submitted links), and Render (hosting).',
      'Your ad is public. It is shown on the billboard and kept in the public History of Kings archive. If you buy the map add-on, the business address you enter is shown publicly with your ad. You can ask us to remove an ad you placed.',
      'Maps. Business maps are provided by Google Maps and load only when you click "Show map"; at that point your browser contacts Google, whose privacy policy then applies.',
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
          <div>
            <h1 className="display text-5xl sm:text-7xl">The rules</h1>
            <p className="label mt-3 text-ink/60">Last updated {LAST_UPDATED}</p>
          </div>
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
