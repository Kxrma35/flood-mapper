import { useEffect, useState } from 'react';

const REQUEST_TIMEOUT_MS = 45000; // room for a server waking from sleep on free hosting
// A failed request is retried sooner than the regular refresh, so a server that was asleep
// (free hosting) is picked up once it wakes instead of minutes later.
const RETRY_MS = 30000;

// Polls a JSON endpoint. A failed request clears the data rather than keeping a stale
// copy, and a slow response is dropped if a newer request has started since.
export function useLiveData(url, intervalMs) {
  const [state, setState] = useState({ data: null, error: false });

  useEffect(() => {
    let active = true;
    let latest = 0;
    let retry = null;

    async function load() {
      const request = ++latest;
      clearTimeout(retry);
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        if (active && request === latest) setState({ data: body, error: false });
      } catch (err) {
        console.error(`${url} failed:`, err.message);
        if (active && request === latest) {
          setState({ data: null, error: true });
          retry = setTimeout(load, RETRY_MS);
        }
      }
    }

    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(retry);
    };
  }, [url, intervalMs]);

  return state;
}
