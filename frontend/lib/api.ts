export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('byn_token');
}

export function setToken(token: string) {
  localStorage.setItem('byn_token', token);
}

export function clearToken() {
  localStorage.removeItem('byn_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401 && typeof window !== 'undefined') {
      // Session expired/invalidated mid-use — notify AuthContext so it clears
      // user state and the existing (app)/layout.tsx guard redirects to /login,
      // instead of every caller just showing a generic error toast forever.
      window.dispatchEvent(new Event('byn:unauthorized'));
    }
    throw Object.assign(new Error(err.error ?? res.statusText), { status: res.status, code: err.code });
  }
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders(), credentials: 'include' });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return handleResponse<T>(res);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  return handleResponse<T>(res);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
    credentials: 'include',
  });
  return handleResponse<T>(res);
}
