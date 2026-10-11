import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import WalletPanel from '../components/WalletPanel.jsx';

// The wallet as a page: payment providers return here after a coin pack,
// and it is the address in the backup file for restoring a wallet.
export default function WalletPage() {
  const paid = new URLSearchParams(window.location.search).get('paid');
  return (
    <div className="min-h-screen bg-canvas">
      <Header />
      <main className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <p className="label text-bh-blue">Coins</p>
        <h1 className="display mt-2 text-5xl">Your wallet</h1>
        {paid && <p className="mt-4 border-2 border-ink bg-bh-yellow px-4 py-3 font-bold">Payment received. Your coins appear here as soon as the payment provider confirms it (usually seconds).</p>}
        <div className="mt-6 border-4 border-ink bg-paper p-5 shadow-hard-sm">
          <WalletPanel />
        </div>
      </main>
      <Footer />
    </div>
  );
}
