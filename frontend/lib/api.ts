// Auth is carried solely by the httpOnly `byn_token` cookie (see credentials:
// 'include' below) -- this only exists to purge a token a pre-fix browser may
// still have sitting in localStorage from before auth stopped duplicating the
// JWT there. Not written to anymore.
export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('byn_token');
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
  const res = await fetch(path, { credentials: 'include' });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return handleResponse<T>(res);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse<T>(res);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  return handleResponse<T>(res);
}
