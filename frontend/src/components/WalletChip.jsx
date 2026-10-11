import { lazy, Suspense, useState } from 'react';
import { Coins, Loader2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useModal } from '../lib/useModal.js';
import { useWallet } from '../lib/wallet.js';

const WalletPanel = lazy(() => import('./WalletPanel.jsx'));

export function WalletDialog({ onClose }) {
  const dialog = useModal(onClose);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="wallet-title"
      className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border-4 border-ink bg-paper p-0 text-ink shadow-hard-lg backdrop:bg-ink/60"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b-4 border-ink bg-bh-yellow px-5 py-3">
        <h2 id="wallet-title" className="font-black uppercase tracking-wider">
          Your coin wallet
        </h2>
        <button type="button" onClick={() => dialog.current.close()} aria-label="Close" className="hover:opacity-80">
          <X className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>
      <div className="p-5">
        <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" strokeWidth={3} />}>
          <WalletPanel />
        </Suspense>
      </div>
    </dialog>
  );
}

// In the header on every page: coins + the "Saved" shield, so players always
// see that their wallet is safe (green) or still needs its backup (amber).
export default function WalletChip() {
  const { wallet } = useWallet();
  const [open, setOpen] = useState(false);
  const Shield = wallet?.backedUp ? ShieldCheck : ShieldAlert;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border-2 border-ink bg-bh-yellow px-2 py-1 text-sm font-black tabular-nums shadow-hard-xs transition duration-150 hover:-translate-y-0.5"
        aria-label={wallet ? `${wallet.balance} coins. ${wallet.backedUp ? 'Wallet saved.' : 'Wallet not backed up yet.'} Open wallet` : 'Get free coins'}
        data-testid="wallet-chip"
      >
        <Coins className="h-4 w-4" strokeWidth={3} />
        {wallet ? (
          <>
            <span>{wallet.balance >= 100000 ? `${Math.floor(wallet.balance / 1000)}k` : wallet.balance.toLocaleString()}</span>
            <span className={`flex items-center gap-0.5 border-l-2 border-ink pl-1.5 ${wallet.backedUp ? 'text-[#1d7a45]' : 'text-bh-red'}`}>
              <Shield className="h-4 w-4" strokeWidth={3} />
              <span className="hidden text-[10px] uppercase tracking-wider lg:inline">{wallet.backedUp ? 'Saved' : 'Back up'}</span>
            </span>
          </>
        ) : (
          <span className="text-xs uppercase tracking-wider">Free coins</span>
        )}
      </button>
      {open && <WalletDialog onClose={() => setOpen(false)} />}
    </>
  );
}
