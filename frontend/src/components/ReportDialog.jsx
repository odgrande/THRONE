import { useEffect, useRef, useState } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import { api } from '../lib/api.js';

export const REPORT_REASONS = [
  { key: 'scam', label: 'Scam, phishing or fraud' },
  { key: 'adult', label: 'Sexual or adult content' },
  { key: 'hate', label: 'Hate or harassment' },
  { key: 'violence', label: 'Violence or dangerous acts' },
  { key: 'copyright', label: 'Uses my copyright or trademark' },
  { key: 'impersonation', label: 'Impersonates someone' },
  { key: 'other', label: 'Something else' },
];

// "Report" link + modal. Anonymous: no account, no email required.
export default function ReportButton({ bidId, adName, className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`label inline-flex items-center gap-1.5 hover:text-bh-red ${className}`}>
        <Flag className="h-3.5 w-3.5" strokeWidth={3} /> Report ad
      </button>
      {open && <ReportDialog bidId={bidId} adName={adName} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({ bidId, adName, onClose }) {
  const dialog = useRef(null);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState('form'); // form | sending | done
  const [error, setError] = useState(null);

  // Native <dialog>: focus trapping, Esc to close and a backdrop for free.
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    const close = () => onClose();
    el.addEventListener('close', close);
    return () => el.removeEventListener('close', close);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await api.report(bidId, reason, details.trim());
      setState('done');
    } catch (err) {
      setError(err.message);
      setState('form');
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="report-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md border-4 border-ink bg-white p-0 text-ink shadow-hard-lg backdrop:bg-ink/60"
    >
      <div className="flex items-center justify-between gap-3 border-b-4 border-ink bg-bh-red px-5 py-3 text-white">
        <h2 id="report-title" className="font-black uppercase tracking-wider">Report this ad</h2>
        <button type="button" onClick={() => dialog.current.close()} aria-label="Close" className="hover:opacity-80">
          <X className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>

      {state === 'done' ? (
        <div className="space-y-4 p-5">
          <p className="text-xl font-black uppercase tracking-tight">Thanks, we got it</p>
          <p className="font-medium leading-relaxed">
            Our team reviews every report. Ads that break the rules are taken down, and enough reports from different people hide an
            ad straight away while we check it.
          </p>
          <button type="button" onClick={() => dialog.current.close()} className="btn-outline w-full">
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 p-5">
          <p className="text-sm font-medium text-ink/70">
            Reporting <span className="font-bold text-ink">{adName}</span>. Reports are anonymous.
          </p>
          <fieldset className="space-y-2">
            <legend className="label mb-2">What's wrong?</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r.key}
                className={`flex cursor-pointer items-center gap-3 border-2 border-ink px-3 py-2 font-medium transition duration-200 ${
                  reason === r.key ? 'bg-bh-yellow' : 'bg-white hover:bg-bh-cream'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.key}
                  checked={reason === r.key}
                  onChange={() => setReason(r.key)}
                  className="h-4 w-4 accent-bh-red"
                  required
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <label className="block">
            <span className="label mb-1.5 flex justify-between">
              Details <span className="text-ink/50">Optional</span>
            </span>
            <textarea
              className="field min-h-20 resize-y"
              maxLength={500}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={reason === 'copyright' ? 'Which work is yours? A formal notice can go to the address in our Copyright policy.' : ''}
            />
          </label>
          {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
          <button type="submit" disabled={!reason || state === 'sending'} className="btn-red w-full">
            {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> : null}
            Send report
          </button>
        </form>
      )}
    </dialog>
  );
}
