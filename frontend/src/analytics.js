// Anonymous visit counts with Cloudflare Web Analytics: no cookies and no personal data.
// Runs only in the built site, and only when VITE_CF_ANALYTICS_TOKEN is set. The token is
// public (it is in every page's HTML), so it lives in the host's settings, not the code.
export function startAnalytics() {
  const token = import.meta.env.VITE_CF_ANALYTICS_TOKEN;
  if (!import.meta.env.PROD || !token) return;
  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.dataset.cfBeacon = JSON.stringify({ token });
  document.body.appendChild(script);
}
