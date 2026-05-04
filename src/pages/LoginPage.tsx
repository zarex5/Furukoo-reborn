import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { FurukooLogo } from '../components/FurukooLogo';

function makeCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const toggleDark = () => setIsDark(d => {
    const n = !d; localStorage.setItem('theme', n ? 'dark' : 'light'); return n;
  });

  const [mode,     setMode]     = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email,    setEmail]    = useState('');
  const [captcha,  setCaptcha]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const captchaChallenge = useMemo(makeCaptcha, [mode]);

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
        : await api.register(username, password, email || undefined);
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

      {/* Dark mode toggle — top right */}
      <div className="fixed top-3 right-3">
        <button role="switch" aria-checked={isDark} onClick={toggleDark}
          className="flex items-center gap-1.5 focus:outline-none select-none">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={isDark ? '#a78bfa' : '#475569'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <span className={`relative inline-block w-8 h-4 rounded-full transition-colors ${isDark ? 'bg-violet-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : ''}`} />
          </span>
        </button>
      </div>

      <FurukooLogo />

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
            <input className={inp} type="email" placeholder="Email (optional)"
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
    </div>
    </div>
  );
}
