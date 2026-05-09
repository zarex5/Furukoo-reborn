import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { FurukooLogo } from '../components/FurukooLogo';
import { DarkToggle } from '../components/DarkToggle';
import { useDarkMode } from '../lib/darkMode';

function makeCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const { isDark, toggleDark } = useDarkMode();

  const reason = new URLSearchParams(window.location.search).get('reason');
  const kicked = reason === 'kicked';
  const banned = reason === 'banned';
  const [mode,     setMode]     = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email,    setEmail]    = useState('');
  const [captcha,  setCaptcha]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const captchaChallenge = useMemo(makeCaptcha, [mode]);

  const [guestLoading, setGuestLoading] = useState(false);

  const handleGuest = async () => {
    setGuestLoading(true);
    try {
      const data = await api.guest();
      login(data);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setGuestLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && parseInt(captcha) !== captchaChallenge.answer) {
      setError('Wrong answer — try again');
      setCaptcha('');
      return;
    }
    setLoading(true);
    try {
      const data = mode === 'login'
        ? await api.login(username, password)
        : await api.register(username, password, email);
      login(data);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const inp = `w-full px-3 py-1.5 rounded border text-sm font-mono
    bg-white text-slate-800 border-slate-300 focus:outline-none focus:border-violet-500
    dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-violet-400`;

  const btn = `w-full py-1.5 rounded text-sm font-bold transition
    bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40`;

  return (
    <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex flex-col items-center justify-center gap-6">

      <div className="fixed top-3 right-3">
        <DarkToggle isDark={isDark} onToggle={toggleDark} />
      </div>

      <FurukooLogo />

      {kicked && (
        <div className="w-80 px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-xs font-mono text-amber-800 dark:text-amber-200 text-center">
          You were disconnected — this account connected from another location.
        </div>
      )}
      {banned && (
        <div className="w-80 px-4 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-xs font-mono text-red-800 dark:text-red-200 text-center">
          Your account has been banned.
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-6 w-80 shadow-lg">
        {/* Tab toggle */}
        <div className="flex mb-5 rounded-lg overflow-hidden border border-slate-200 dark:border-gray-700 text-xs font-bold">
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setCaptcha(''); }}
              className={`flex-1 py-1.5 transition ${mode === m
                ? 'bg-violet-600 text-white'
                : 'bg-white dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-700'}`}
            >{m === 'login' ? 'Sign in' : 'Create account'}</button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className={inp} placeholder="Username" value={username}
            onChange={e => setUsername(e.target.value)} autoFocus required />
          <input className={inp} type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required />

          {mode === 'register' && <>
            <input className={inp} type="email" placeholder="Email" required
              value={email} onChange={e => setEmail(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500 dark:text-gray-400 flex-none">
                {captchaChallenge.a} + {captchaChallenge.b} =
              </span>
              <input className={`${inp} w-20`} type="number" placeholder="?"
                value={captcha} onChange={e => setCaptcha(e.target.value)} required />
            </div>
          </>}

          {error && <p className="text-red-500 dark:text-red-400 text-xs text-center">{error}</p>}

          <button type="submit" disabled={loading} className={btn}>
            {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>

      {/* Guest play */}
      <div className="w-80 flex flex-col items-center gap-2">
        <div className="w-full flex items-center gap-2">
          <div className="flex-1 border-t border-slate-200 dark:border-gray-700" />
          <span className="text-xs font-mono text-slate-400 dark:text-gray-500">or</span>
          <div className="flex-1 border-t border-slate-200 dark:border-gray-700" />
        </div>
        <button onClick={handleGuest} disabled={guestLoading}
          className="w-full py-1.5 rounded text-sm font-bold transition border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-40">
          {guestLoading ? '…' : 'Play as Guest'}
        </button>
        <p className="text-[10px] font-mono text-slate-400 dark:text-gray-500 text-center whitespace-nowrap">
          ELO won't be saved and account cannot be recovered.
        </p>
      </div>

    </div>
    </div>
  );
}
