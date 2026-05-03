const BASE = '/api';

async function post(path: string, body: Record<string, string>) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as { token: string; username: string; elo: number };
}

export const api = {
  register: (username: string, password: string) => post('/register', { username, password }),
  login:    (username: string, password: string) => post('/login',    { username, password }),
};
