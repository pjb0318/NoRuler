interface Env {
  TURNSTILE_SITE_KEY?: string;
  VITE_TURNSTILE_SITE_KEY?: string;
}

/** Only the public widget key is exposed. Secret keys stay in the analysis handler. */
export function onRequestGet({ env }: { env: Env }): Response {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() || env.VITE_TURNSTILE_SITE_KEY?.trim() || '';
  return Response.json({ turnstileRequired: true, turnstileSiteKey: siteKey }, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
