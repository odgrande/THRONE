import { Plus } from 'lucide-react';
import InfoPage, { SectionTitle } from '../components/InfoPage.jsx';

// Plain answers. Keep them in step with the Terms (/legal): if a rule
// changes, change both.
const GROUPS = [
  {
    id: 'game',
    title: 'The free game and coins',
    items: [
      ['How do I win the Throne?', 'Play the free daily puzzle race. Slide the tiles into order, 1 to 15, as fast as you can. If your time beats the king’s, your ad takes the big billboard straight away, live on every screen, until someone is faster. The fastest time when the daily race closes is King of the Day.'],
      ['Is it really free?', 'Yes. You get free tries every day and welcome coins to start. No signup, no card, no money. Extra tries and some extras cost coins, which you earn by playing.'],
      ['What are coins?', 'Play money for Throne. Use them for extra tries, the Crown Shield and ad time on the Court, the Spotlight and the Market. Coins have no cash value and can never be cashed out, sold or transferred.'],
      ['How do I get coins?', 'By playing: welcome coins, coins for your first solves each day, daily coins every day you come back, coins for taking the Throne and for King of the Day, and coins for inviting friends who play. Coins can’t be bought.'],
      ['Why do I have to wait between tries?', 'Fair play. There is a short reset timer after every try and a longer one after several unfinished tries in a row, and free tries are counted per wallet, device and network. Switching browser, phone or wallet does not give extra tries.'],
      ['What is the “Saved” badge?', 'It shows your wallet is backed up. Your wallet has a secret backup code: save it (copy it or download the file) and you can open the same wallet, with all your coins and records, on any browser or phone. Until then the badge says “Back up”. Keep the code private, and never share it: we will never ask for it.'],
      ['What is the Crown Shield?', 'If you are king, you can spend coins to shield your crown for a while. During the shield, challengers must beat your time by 10%.'],
      ['How do invites work?', 'Share your link from the Invite page. When a friend joins and plays their first game, you both get coins. Every few friends who play earns you a free Market stall day, and you get a share of the coins they spend on ads. Invites from your own devices don’t count.'],
      ['Can I play with a bot?', 'No. The server deals every puzzle, checks every move and keeps the time. Solves faster than a person can play are not ranked, and wallets that cheat are suspended.'],
    ],
  },
  {
    id: 'buying',
    title: 'Buying an ad',
    items: [
      ['What is Throne?', 'A live billboard for businesses. Everyone on the site sees the same ads at the same time. There is one big billboard (the Throne), plus smaller spaces you can book: the Court, the Spotlight and the Market.'],
      ['Do I need an account?', 'No. Add your name or brand, a short line or picture (or a video), your link, and pay with coins or money. Your browser keeps a private code so you can see your ad’s results on My ads.'],
      ['How does the Throne work?', 'It is won in the free daily puzzle race (see above): the fastest time puts its ad on the big billboard, on every screen, until someone beats it.'],
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
      ['How do I pay?', 'Nigeria: card, bank transfer or USSD through Paystack, in Naira (prices include 7.5% VAT). Global: card or bank in US dollars through Flutterwave. You pay on their secure page, never on ours.'],
      ['Can I get a refund?', 'Once your ad has gone live, your payment is non-refundable. We refund you automatically and in full only if: someone else’s payment cleared first and yours no longer met the price; your video or Nigerian ad is rejected in review; a video isn’t reviewed within 24 hours; or a relegation offer was already used. Being outbid on the Throne after your ad went live is not a reason for a refund: that is how the auction works.'],
      ['I was outbid. Is there anything I can do?', 'Yes. Within 24 hours you can move the same ad to a Court board for one day at half price, and every dethroned ad is shown free for 24 hours in “Recently dethroned”.'],
      ['Something went wrong with my payment.', 'Email therone@gmail.com with the time of payment and the ad’s name. If you bought from this browser, the ad’s details are on My ads.'],
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
      ['What data do you keep about me?', 'Almost none. No accounts, no passwords, no card details, no tracking cookies, and your receipt email goes to the payment provider only. See Safety & security for the full list.'],
      ['How do I report an ad?', 'Press “Report ad” on it. When several people report the same ad, it is hidden at once until we review it.'],
      ['Who runs Throne?', 'Throne is run by a registered company; its details are at the bottom of the Terms page. For anything else, email therone@gmail.com.'],
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
