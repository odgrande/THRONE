import { Plus } from 'lucide-react';
import InfoPage, { SectionTitle } from '../components/InfoPage.jsx';

// Plain answers. Keep them in step with the Terms (/legal): if a rule
// changes, change both.
const GROUPS = [
  {
    id: 'buying',
    title: 'Buying an ad',
    items: [
      ['What is Throne?', 'A live billboard for businesses. Everyone on the site sees the same ads at the same time. There is one big billboard (the Throne), plus smaller spaces you can book: the Court, the Spotlight and the Market.'],
      ['Do I need an account?', 'No. Add your name or brand, a short line or picture (or a video), your link, and pay. Your browser keeps a private code so you can see your ad’s results on My ads.'],
      ['How does the Throne work?', 'It is an auction. Pay more than the current ad and yours replaces it immediately, on every screen. Someone can do the same to you at any time. Each new ad gets a short “shield” during which taking over costs more, and an ad nobody outbids stays up to 7 days.'],
      ['I don’t want to be outbid. What can I book?', 'Book a Court board, a Spotlight space or a Market stall for 1, 3 or 7 days at a fixed price. Nobody can replace your ad during the days you paid for. Market stalls start from ₦300 / $0.50 a day.'],
      ['Can I use a video?', 'Yes, on the Throne, the Court and the Spotlight, for an extra fee. MP4 or MOV, up to 30 seconds and 20 MB. A person watches every video before it goes live.'],
      ['Why isn’t my Nigerian ad live straight away?', 'In the Nigeria edition every paid ad waits about 5 minutes in our review queue before it goes live, in line with Nigerian advertising rules. If we reject it, you get a full refund.'],
      ['What ads are not allowed?', 'Scams, false or misleading claims, adult content, hate, violence, illegal products, unlicensed gambling, impersonation, content you don’t own, and political or advocacy ads. The full list is in the Ad Policy.'],
      ['Why are political ads banned?', 'We can’t verify who pays for an ad, election advertising is tightly regulated (in Nigeria by the Electoral Act 2022 and INEC), and we want the billboard to stay neutral for business.'],
    ],
  },
  {
    id: 'payments',
    title: 'Payments and refunds',
    items: [
      ['How do I pay?', 'Nigeria: card, bank transfer or USSD through Paystack, in Naira (prices include 7.5% VAT). Global: in US dollars through the payment provider shown at checkout.'],
      ['When do I get a refund?', 'Automatically and in full if: someone else’s payment cleared first and yours no longer met the price; your video or Nigerian ad is rejected in review; a video isn’t reviewed within 24 hours; or a relegation offer was already used. Being outbid on the Throne after your ad went live is not a reason for a refund: that is how the auction works.'],
      ['I was outbid. Is there anything I can do?', 'Yes. Within 24 hours you can move the same ad to a Court board for one day at half price, and every dethroned ad is shown free for 24 hours in “Recently dethroned”.'],
      ['Something went wrong with my payment.', 'Contact us with the time of payment and the ad’s name. If you bought from this browser, the ad’s details are on My ads.'],
    ],
  },
  {
    id: 'results',
    title: 'Results',
    items: [
      ['Will I get sales?', 'We can’t promise sales: that depends on your offer. What we show is real: before you pay, the bid form shows how many people visited in the last 7 days and how many clicks ads got. After you buy, My ads shows your ad’s reach and clicks.'],
      ['How are reach and clicks counted?', 'Reach is the number of different people who were on the site while your ad was live (counted once per day). Clicks are visits through our link-safety page to your link. They are honest estimates, not audited figures.'],
    ],
  },
  {
    id: 'safety',
    title: 'Safety and your data',
    items: [
      ['Is it safe to click an ad?', 'Every link is checked for malware and phishing before the ad is accepted, and every click first shows you where you are going. Still, we don’t endorse advertisers: check a business before you pay it.'],
      ['What data do you keep about me?', 'Almost none. No accounts, no passwords, no card details, no tracking cookies, and your receipt email goes to Paystack only. See Safety & security for the full list.'],
      ['How do I report an ad?', 'Press “Report ad” on it. When several people report the same ad, it is hidden at once until we review it.'],
      ['Who runs Throne?', 'Throne is owned and operated by Odgrande NG Limited (RC1029807). Contact us any time through the contact page.'],
    ],
  },
];

export default function FaqPage() {
  return (
    <InfoPage kicker="Help" title="Questions, answered." intro="Everything people usually ask before buying an ad. Can’t find yours? Contact us." tone="bg-bh-red text-white">
      <nav aria-label="FAQ sections" className="flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="btn-outline btn-sm">
            {g.title}
          </a>
        ))}
      </nav>
      {GROUPS.map((g) => (
        <section key={g.id} className="space-y-3">
          <SectionTitle id={g.id}>{g.title}</SectionTitle>
          {g.items.map(([q, a]) => (
            <details key={q} className="group card">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 font-black sm:p-5 sm:text-lg">
                {q}
                <Plus className="mt-0.5 h-5 w-5 shrink-0 transition duration-200 group-open:rotate-45" strokeWidth={3} aria-hidden="true" />
              </summary>
              <p className="border-t-2 border-ink px-4 py-4 font-medium leading-relaxed text-ink/80 sm:px-5">{a}</p>
            </details>
          ))}
        </section>
      ))}
      <div className="card flex flex-col gap-3 bg-bh-yellow p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-black uppercase">Still stuck?</p>
        <div className="flex flex-wrap gap-2">
          <a href="/contact" className="btn-red btn-sm">
            Contact us
          </a>
          <a href="/safety" className="btn-outline btn-sm">
            Safety & security
          </a>
        </div>
      </div>
    </InfoPage>
  );
}
