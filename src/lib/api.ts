const BASE = '/api';

async function post(path: string, body: Record<string, string>) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach server — is it running on port 3001?');
  }
  const text = await res.text();
  let data: Record<string, string> = {};
  try { data = JSON.parse(text); } catch { /* server returned non-JSON */ }
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data as unknown as { token: string; username: string; elo: number };
}

export const api = {
  register: (username: string, password: string, email: string) =>
    post('/register', { username, password, email }),
  login: (username: string, password: string) => post('/login', { username, password }),
};
