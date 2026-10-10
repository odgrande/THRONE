import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api.js';
import Logo from '../components/Logo.jsx';
import Shape from '../components/Shape.jsx';

// Interstitial for every outbound ad click: shows the real destination host
// before the visitor leaves, and counts the click for the advertiser.
export default function GoPage({ bidId }) {
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    api.getLink(bidId).then(setLink, (err) => setError(err.message));
  }, [bidId]);

  const proceed = async () => {
    setLeaving(true);
    try {
      const { targetUrl } = await api.visit(bidId);
      window.location.replace(targetUrl);
    } catch {
      // Click counting is best-effort; still let the visitor through.
      window.location.replace(link.targetUrl);
    }
  };

  return (
    <div className="dot-grid-ink relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bh-yellow px-4 py-12">
      <Shape kind="circle" color="red" className="absolute -left-24 -top-24 h-72 w-72 border-4 border-ink" />
      <Shape kind="square" color="blue" className="absolute -bottom-20 -right-16 h-56 w-56 rotate-45 border-4 border-ink" />

      <div className="relative mb-8">
        <Logo onYellow />
      </div>

      <main className="card relative w-full max-w-lg">
        <div className="flex items-center gap-3 border-b-2 border-ink bg-bh-red px-5 py-4 text-white lg:border-b-4">
          <TriangleAlert className="h-6 w-6 shrink-0" strokeWidth={2.5} />
          <p className="font-black uppercase tracking-wider">You are leaving Throne</p>
        </div>

        <div className="p-5 sm:p-6">
          {error ? (
            <>
              <p className="text-xl font-black uppercase tracking-tight">Ad not found</p>
              <p className="mt-2 font-medium text-ink/70">{error}</p>
              <a href="/" className="btn-outline mt-6 w-full">
                <ArrowLeft className="h-4 w-4" strokeWidth={3} /> Back to the throne
              </a>
            </>
          ) : !link ? (
            <p className="label flex items-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> Checking link
            </p>
          ) : (
            <>
              <p className="label text-ink/60">Ad posted by</p>
              <p className="mt-1 truncate text-2xl font-black uppercase tracking-tight">{link.name}</p>

              <p className="label mt-6 text-ink/60">It will take you to</p>
              <p className="mt-2 break-all border-2 border-ink bg-canvas px-4 py-3 text-2xl font-black tracking-tight">
                {link.host}
              </p>
              <p className="mt-1.5 break-all text-xs text-ink/60">{link.targetUrl}</p>

              <p className="mt-6 border-l-4 border-bh-red pl-4 font-medium leading-relaxed">
                Ads are bought by anyone and are not endorsed by us. Never enter passwords or payment details on a site
                you don't recognize. Proceed at your own risk.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <a href="/" className="btn-outline">
                  <ArrowLeft className="h-4 w-4" strokeWidth={3} /> Back
                </a>
                <button onClick={proceed} disabled={leaving} className="btn-blue">
                  {leaving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> : null}
                  Continue {leaving ? null : <ArrowRight className="h-4 w-4" strokeWidth={3} />}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
