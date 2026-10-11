import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';

// Live legal texts. They describe how the product actually works: if a
// feature changes, update the matching section and LAST_UPDATED, and have
// counsel check the change.
const LAST_UPDATED = '11 October 2026';
const OPERATOR = 'Odgrande NG Limited';
const CONTACT = 'therone@gmail.com';
const RC_NUMBER = 'RC1029807';

const SECTIONS = [
  {
    id: 'terms',
    title: 'Terms of Service',
    body: [
      `Throne is owned and operated by ${OPERATOR}, a company registered with the Corporate Affairs Commission of Nigeria under number ${RC_NUMBER} ("we", "us"). Throne is an online business; you can reach us at ${CONTACT}. By using the site or buying an ad you agree to these terms.`,
      'Who can buy. You must be at least 18 and able to enter a binding contract, and you must have the right to advertise the business, product or person in your ad. There are no accounts: you are responsible for everything you submit.',
      'The Throne. The Throne is won in the free daily Throne Race described in “Coins & the Throne Race” below. Time on the Throne is not guaranteed: it ends when someone beats your time, a new day’s race begins, or the maximum term (currently 7 days) ends. (We may also run the Throne as an auction, where you pay at least the minimum price shown and your ad replaces the current one immediately; these terms then apply to it.)',
      'Bookings (fixed price, in money or coins): the Court boards, the Spotlight spaces and the Market stalls can be booked for 1, 3 or 7 days. Your ad runs for the full period you paid for, starting at the next free slot when your payment clears, and other advertisers cannot displace it.',
      'Relegation. If your Throne ad is outbid, you may, within 24 hours, move the same ad to a Court board for one day at a discount. Dethroned ads are also shown free for 24 hours in "Recently dethroned".',
      'Review before publishing (Nigeria edition). In line with the advertising rules of the Advertising Regulatory Council of Nigeria (ARCON), every ad bought in the Nigeria edition waits in our review queue for about 5 minutes after payment before it goes live. We may reject it in that time, in which case we refund you in full. A Throne bid that has been outbid by the time it goes live is refunded in full.',
      'Prices and VAT. Prices in the Nigeria edition are in Naira and include Value Added Tax (VAT) at 7.5%. Prices in the Global edition are in US dollars.',
      'Video ads cost more and are watched by a member of our team before they go live. A video is not shown until it is approved. If we reject it, if it is not reviewed within 24 hours, or if your Throne bid has been outbid by the time it is approved, we refund you in full.',
      'Refunds. Ads that have gone live are non-refundable: being outbid, the end of your booked days, or results you did not expect are not reasons for a refund. We refund you in full automatically only when: (a) another payment cleared first and your Throne bid no longer met the minimum; (b) a relegation offer had already been used; (c) your video ad is rejected or not reviewed in time; or (d) the law requires a refund. We may also refund at our discretion.',
      'Results. We show each ad’s reach and clicks as counted by our systems in good faith. These are estimates, not audited figures, and we do not promise any level of traffic, clicks or sales.',
      'Content rules. Your ad must follow the Ad Policy below. Ads are screened automatically before payment, but passing screening is not approval. We may remove any ad at any time, without refund, if it breaks these terms, the Ad Policy or the law. A removed ad keeps its slot, but its content is hidden. We may also pause new ads for a short time (for example during maintenance or abuse).',
      'King of the Day is a title only. It has no cash or prize value; any coins that come with it are play money (see “Coins & the Throne Race”).',
      'Liability. The service is provided "as is". We do not endorse any advertiser or the sites they link to, and we are not affiliated with them. Check any business before paying it. To the extent the law allows, our total liability to you is limited to the amount you paid us in the 30 days before the claim. Nothing in these terms limits liability that cannot be limited by law.',
      'Governing law. These terms shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria, and any disputes shall be resolved in Nigerian courts. If you use the Global edition as a consumer living outside Nigeria, nothing in these terms removes protections that the consumer laws of your country do not allow to be excluded by agreement.',
      `Changes. We may update these terms; the date at the top shows the latest version, and the version in force when you paid applies to that purchase. Questions: ${CONTACT}.`,
    ],
  },
  {
    id: 'game',
    title: 'Coins & the Throne Race',
    body: [
      'The Throne Race. The big billboard (the Throne) is won in a free daily puzzle race, not bought. Each try deals you a new puzzle; our server times it from the moment the puzzle is dealt to the moment your solve reaches us. If your time beats the current king’s, the ad on your ad card takes the Throne straight away and stays until someone beats your time, a new day’s race begins, or the maximum term ends. The fastest time when the daily race closes is crowned King of the Day.',
      'Free tries and the reset timer. Everyone gets a number of free tries each day. Extra tries cost coins. There is a short wait after every try and a longer one after several unfinished or failed tries in a row. Limits apply per wallet, per device and per network, so using another browser, device or wallet does not give extra tries.',
      'Your ad card. To race for the Throne you save an ad card (name, short line, picture and link). It must follow the Ad Policy and is screened like any ad; in the Nigeria edition it waits in our review queue first. When your time wins, the Throne shows your ad card as it was at that moment.',
      'Coins. Coins are play money for Throne only. They have no cash value, are not money, e-money or a deposit, and can never be cashed out, sold, transferred to another wallet or exchanged for anything outside Throne. You can earn them (welcome bonus, daily coins, wins, invites) or buy coin packs. You can spend them on extra tries, the Crown Shield and ad time on the Court, the Spotlight and the Market. Coin prices and rewards may change; coins already in your wallet are not taken away because of a change.',
      'Coin packs. Coin packs are paid through Paystack (Nigeria edition) or Flutterwave (Global edition). They are non-refundable once the coins are credited, except where the law requires a refund. If an ad paid with coins cannot be placed or is rejected in review, the coins go back to your wallet.',
      'Crown Shield. The reigning king can spend coins on a Crown Shield for a limited time. While it is on, a challenger must beat the king’s time by 10%. It does not extend the daily race or the maximum term.',
      'Prizes. Prizes are Throne perks only: time on the Throne, the King of the Day title, coins and badges. They have no cash value. There is no stake: you never pay to enter the daily race, and the outcome depends on your own skill and speed, not on chance.',
      'Invites. You can share your invite link. When a friend joins through it and plays their first game on their own device, you both receive coins; every few such friends earn you free ad time, and you receive a share, in coins, of the coins they spend on ads. Invites from your own devices or network, fake or duplicate wallets, and automated sign-ups earn nothing.',
      'Your wallet and backup code. There are no accounts. Your wallet is opened by a secret backup code kept in your browser. Anyone with the code can use your coins, so keep it private. If you lose the code and clear your browser, we cannot recover the wallet. We never ask for your backup code by email or message.',
      'Fair play. One wallet per person. Bots, scripts, automation, exploiting bugs, sharing or selling wallets, and using several wallets to farm coins, tries or invite rewards are not allowed. Solves faster than a person can play are not ranked. We may void results, remove coins obtained unfairly, end a reign, and suspend wallets that break these rules; where coins were bought, we act in line with the refund rules above and the law.',
      'Changes and ending. We may change the game, its limits and coin prices, or end the game, with notice on the site. If we end the game, we will give a reasonable period to use coins on ad time.',
    ],
  },
  {
    id: 'ad-policy',
    title: 'Ad Policy',
    body: [
      'Not allowed: scams, phishing, malware or misleading links; false or misleading claims; sexual or adult content; content involving minors in any harmful way; hate, harassment or threats; violence or dangerous activities; illegal goods or services; gambling or betting that is not licensed where it is offered; impersonation of people or brands; content you do not have the rights to use; and political or advocacy ads.',
      'Political and advocacy ads are not allowed, without exception. This means any ad for or against a political party, candidate, campaign, election, referendum or ballot measure; any ad by a government, party or political group asking for votes, support or donations; and any advocacy ad that campaigns on a political or social issue, a law or a government policy. Ads are checked for political content automatically before payment, and blocked ads are never charged. Why: (1) Throne has no accounts, so we cannot verify who paid for an ad and give voters the "paid for by" transparency that election rules expect; (2) election advertising is tightly regulated, including when, how and by whom it may be run (in Nigeria by the Electoral Act 2022 and the Independent National Electoral Commission, and elsewhere by each country’s own laws), and we cannot check those rules ad by ad, worldwide, in real time; and (3) we want the billboard to stay a neutral space for businesses and creators.',
      'Links must lead where the ad says they do. Every outbound click shows visitors the destination before they leave.',
      'Anyone can report an ad. Ads reported by several different people may be hidden at once while we review them.',
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    body: [
      `Who is responsible. ${OPERATOR} is the data controller for personal data processed on Throne. Contact: ${CONTACT}.`,
      'What we collect: the ad you submit (name, tagline, image or video, link, and the business address if you buy the map add-on); which edition you used (Global or Nigeria, picked from your country as reported by Cloudflare, which you can change); the amount and time of each purchase; a hashed (scrambled) version of a private owner code for each ad; a salted hash of the IP address of anyone who reports an ad (used only to count each person once); and short-lived IP-based counters to stop abuse.',
      'Audience numbers. To show advertisers real results (people online, visitors per day, and each ad’s reach), our server turns each visitor’s IP address into a scrambled code using a secret that is replaced every day. The code is kept only in the server’s memory, is never stored, and cannot be linked back to you or across days. We store only totals (for example, 120 visitors on a day; 50 people reached by an ad).',
      'Video ads are watched by a member of our team before they go live. Videos that are rejected, or never paid for, are deleted.',
      'When you buy an ad we record that you accepted the rules (the version and the time), together with the ad.',
      'The game wallet. If you play, we keep: a scrambled (hashed) version of your wallet’s backup code (never the code itself); your coin balance and a history of every coin added or spent; your player name and ad card; your game results (times, number of moves, when you played); who invited you and whom you invited; and coin pack orders. To enforce fair play (daily limits, the reset timer and invite rules) we also keep, with each wallet and game, a salted hash of your network (IP address) and of a random device code your browser creates. These hashes cannot be turned back into your IP address, are used only against abuse, and are erased after 30 days.',
      'If you email us, we use your message and email address only to answer you, and delete the conversation when it is no longer needed.',
      'No accounts and no tracking cookies. Your browser keeps the owner codes for ads you bought (localStorage, for 90 days), so it can show your ads’ results on My ads and offer you a relegation if your Throne ad is outbid. If you play, it also keeps your wallet’s backup code, a random device code, the moves of an unfinished game (so a reload can resume it) and your recent results.',
      'Payments are processed by Paystack (Nigeria edition, in Naira) and Flutterwave (Global edition, in US dollars), on their own secure checkout pages. We never see or store card numbers or bank details.',
      'Email for payment receipts. Paystack and Flutterwave require an email address to send your receipt. We pass the email you type straight to them and do not store it ourselves.',
      'Service providers who receive data to run the site: Paystack and Flutterwave (payments), Supabase (database and file storage), Cloudflare (security, bot checks and delivery), OpenAI (automated content screening of submitted ads), Google Web Risk (checking submitted links), and Render (hosting). Some of them process data outside Nigeria (for example in the United States or the European Union). We use providers that protect personal data under written terms with appropriate safeguards.',
      'Your ad is public. It is shown on the billboard and kept in the public History of Kings archive. If you buy the map add-on, the business address you enter is shown publicly with your ad. You can ask us to remove an ad you placed.',
      'Maps. Business maps are provided by Google Maps and load only when you click "Show map"; at that point your browser contacts Google, whose privacy policy then applies.',
    ],
  },
  {
    id: 'data-rights',
    title: 'Your Data Rights',
    body: [
      'Why we use your data (legal bases): to provide what you paid for (performance of a contract); to keep Throne safe, stop fraud and abuse, and count audiences in a way that does not identify anyone (our legitimate interests, balanced against your rights); and to keep records the law requires, such as payment and tax records (legal obligation).',
      'Your rights. Under the Nigeria Data Protection Act 2023, and, if you live there, the data protection laws of your own country (such as the GDPR in the European Union and the United Kingdom), you can ask us to: tell you what personal data we hold about you and give you a copy; correct it if it is wrong; delete it; restrict or object to how we use it; and give it to you in a portable format. Where we rely on your consent, you can withdraw it at any time.',
      'Automated screening. Ads are screened automatically before payment, and a blocked ad is not charged. If you think your ad was blocked by mistake, email us and a person will review it.',
      'How to ask. Email us. Because there are no accounts, we may ask you to show the ad is yours (for example with the owner code in your browser or your payment receipt) before we act. We reply within one month, and we do not charge for a reasonable request.',
      'How long we keep data. Ads stay in the public archive until you ask us to remove them or we remove them. Payment records are kept for as long as accounting and tax law requires. Reporter IP hashes are kept only as long as the report is open. Network and device hashes on game records are erased after 30 days; a wallet and its history are kept while it is in use and can be deleted on request (the backup code proves it is yours). We do not store receipt emails at all.',
      'Complaints. You can complain to the Nigeria Data Protection Commission (NDPC), or to the data protection authority in the country where you live. We would appreciate the chance to fix things first: write to us and we will respond.',
    ],
  },
  {
    id: 'copyright',
    title: 'Copyright & Takedowns',
    body: [
      'If an ad uses your copyright, trademark or likeness without permission, use the Report button on the ad (choose "Uses my copyright or trademark") for the fastest response.',
      `For a formal notice, email ${CONTACT} with: your contact details; the work you own; a link to the ad on our site; a statement that you believe in good faith the use is not authorised; a statement that your notice is accurate and that you are the owner or authorised to act for them; and your signature (typing your full name is enough).`,
      'We act promptly on valid notices, and we may remove repeat infringers’ ads without notice.',
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
          <section id="company" className="scroll-mt-8 border-t-2 border-ink pt-6 text-sm" aria-label="Company details">
            <p className="font-bold">
              © {new Date().getFullYear()} {OPERATOR}. Throne is owned and operated by {OPERATOR}.
            </p>
            <p className="mt-1 text-ink/70">
              CAC registration number {RC_NUMBER} · Contact:{' '}
              <a href={`mailto:${CONTACT}`} className="font-bold underline hover:text-bh-red">
                {CONTACT}
              </a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
