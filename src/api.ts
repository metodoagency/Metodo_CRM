let csrf = '';
export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
async function apiResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, { ...options, credentials: 'include', headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...options.headers } });
  if (!res.ok) { const error = await res.json().catch(() => ({})); throw new ApiError(res.status, error.code ?? 'INTERNAL_ERROR'); }
  return res;
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> { return (await apiResponse(path, options)).json(); }
export async function apiBlob(path: string, options?: RequestInit): Promise<Blob> { return (await apiResponse(path, options)).blob(); }
export async function loadSession() { const me = await api<{ id: string; csrfToken: string }>('/api/me'); csrf = me.csrfToken; return me; }
export const body = (value: unknown) => JSON.stringify(value);
