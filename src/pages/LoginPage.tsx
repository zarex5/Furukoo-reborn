import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { FurukooLogo } from '../components/FurukooLogo';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const isDark = localStorage.getItem('theme') === 'dark';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = mode === 'login'
        ? await api.login(username, password)
        : await api.register(username, password);
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
      <FurukooLogo />

      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-6 w-80 shadow-lg">
        {/* Tab toggle */}
        <div className="flex mb-5 rounded-lg overflow-hidden border border-slate-200 dark:border-gray-700 text-xs font-bold">
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
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
