import { useEffect, useState } from 'react';

const REQUEST_TIMEOUT_MS = 20000;

// Polls a JSON endpoint. A failed request clears the data rather than keeping a stale
// copy, and a slow response is dropped if a newer request has started since.
export function useLiveData(url, intervalMs) {
  const [state, setState] = useState({ data: null, error: false });

  useEffect(() => {
    let active = true;
    let latest = 0;

    async function load() {
      const request = ++latest;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        if (active && request === latest) setState({ data: body, error: false });
      } catch (err) {
        console.error(`${url} failed:`, err.message);
        if (active && request === latest) setState({ data: null, error: true });
      }
    }

    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  return state;
}
