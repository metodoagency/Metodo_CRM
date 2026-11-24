import { useCallback, useEffect, useRef, useState } from 'react';
import { api, body } from './api';

// Never place private request payloads or responses in Query/Mutation caches.
export function usePrivateRequest() {
  const current = useRef(0); const controller = useRef<AbortController>(); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>();
  const cancel = useCallback(() => { current.current++; controller.current?.abort(); setBusy(false); }, []);
  useEffect(() => () => { current.current++; controller.current?.abort(); }, []);
  async function run<T>(url: string, payload: unknown, done: (data: T) => void | Promise<void>, method = 'POST') {
    cancel(); setError(undefined); const generation = ++current.current; const abort = new AbortController(); controller.current = abort; setBusy(true);
    try { const result = await api<T>(url, { method, body: body(payload), signal: abort.signal }); if (generation === current.current && !abort.signal.aborted) await done(result); }
    catch (cause) { if (generation === current.current) setError(cause); }
    finally { if (generation === current.current) setBusy(false); }
  }
  return { run, cancel, busy, error };
}
