import { useState, useMemo } from 'react';
import { api } from '../lib/api';

function makeCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

const PAGES    = ['Login', 'Lobby', 'Game', 'Profile', 'Other'] as const;
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Note'] as const;

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'text-red-600 dark:text-red-400',
  High:     'text-orange-500 dark:text-orange-400',
  Medium:   'text-amber-500 dark:text-amber-400',
  Low:      'text-blue-500 dark:text-blue-400',
  Note:     'text-slate-500 dark:text-gray-400',
};

export function ReportIssueModal({ onClose }: { onClose: () => void }) {
  const [page,        setPage]        = useState<typeof PAGES[number]>('Lobby');
  const [severity,    setSeverity]    = useState<typeof SEVERITIES[number]>('Medium');
  const [description, setDescription] = useState('');
  const [captcha,     setCaptcha]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);

  const captchaChallenge = useMemo(makeCaptcha, []);

  const inp = `w-full px-3 py-1.5 rounded border text-sm font-mono
    bg-white text-slate-800 border-slate-300 focus:outline-none focus:border-violet-500
    dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-violet-400`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parseInt(captcha) !== captchaChallenge.answer) {
      setError('Wrong answer — try again');
      setCaptcha('');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please describe the issue in more detail (min 10 characters)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.reportIssue(page, severity, description.trim());
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl px-6 py-5 flex flex-col gap-4 max-w-sm w-full mx-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 dark:text-gray-200">Report an Issue</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {success ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-3">✅</div>
            <p className="text-sm font-bold text-slate-700 dark:text-gray-200 mb-1">Report submitted!</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">Admins will be notified and will look into it.</p>
            <button onClick={onClose}
              className="mt-4 px-4 py-1.5 rounded text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1">Page / Feature</label>
                <select value={page} onChange={e => setPage(e.target.value as typeof PAGES[number])} className={inp}>
                  {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1">Severity</label>
                <select value={severity} onChange={e => setSeverity(e.target.value as typeof SEVERITIES[number])}
                  className={`${inp} ${SEVERITY_COLORS[severity]}`}>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe what happened and how to reproduce it…"
                required
                rows={4}
                maxLength={2000}
                className={`${inp} resize-none`}
              />
              <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5 text-right">{description.length}/2000</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500 dark:text-gray-400 flex-none">
                {captchaChallenge.a} + {captchaChallenge.b} =
              </span>
              <input
                className={`${inp} w-20`}
                type="number"
                placeholder="?"
                value={captcha}
                onChange={e => setCaptcha(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-red-500 dark:text-red-400 text-xs text-center">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose}
                className="px-3 py-1.5 rounded text-sm text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-1.5 rounded text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition">
                {loading ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
