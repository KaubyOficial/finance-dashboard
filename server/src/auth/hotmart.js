// Hotmart API client — client-credentials token (expires ~48h, cached) + a thin
// GET helper. Network calls go through an injectable `transport` (default fetch)
// so sync logic can be unit-tested without hitting the real API (S2.1).
import { env } from '../env.js';

const HOSTS = {
  production: {
    auth: 'https://api-sec-vlc.hotmart.com/security/oauth/token',
    api: 'https://developers.hotmart.com',
  },
  sandbox: {
    auth: 'https://api-sec-vlc.hotmart.com/security/oauth/token',
    api: 'https://sandbox.hotmart.com',
  },
};

function basicHeader() {
  if (env.hotmart.basic) return env.hotmart.basic;
  return Buffer.from(`${env.hotmart.clientId}:${env.hotmart.clientSecret}`).toString('base64');
}

const defaultTransport = (url, opts) => fetch(url, opts);

let cache = { token: null, expiresAt: 0 };

/** Fetch (and cache) a client-credentials access token. */
export async function getHotmartToken({ transport = defaultTransport, now = Date.now } = {}) {
  if (cache.token && cache.expiresAt - 60_000 > now()) return cache.token;
  if (!env.hotmart.clientId || !env.hotmart.clientSecret) {
    throw new Error('HOTMART_CLIENT_ID/SECRET ausentes no .env (ver docs/setup-hotmart.md)');
  }
  const host = HOSTS[env.hotmart.environment] || HOSTS.production;
  const url = `${host.auth}?grant_type=client_credentials&client_id=${encodeURIComponent(
    env.hotmart.clientId
  )}&client_secret=${encodeURIComponent(env.hotmart.clientSecret)}`;
  const res = await transport(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicHeader()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Hotmart auth falhou (${res.status}): ${await safeText(res)}`);
  }
  const body = await res.json();
  cache = { token: body.access_token, expiresAt: now() + (body.expires_in || 3600) * 1000 };
  return cache.token;
}

/** GET a Hotmart API path with the bearer token. Returns parsed JSON.
 *  Array query values become repeated params (e.g. transaction_status). */
export async function hotmartGet(path, query = {}, { transport = defaultTransport } = {}) {
  const token = await getHotmartToken({ transport });
  const host = HOSTS[env.hotmart.environment] || HOSTS.production;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) for (const item of v) params.append(k, item);
    else params.append(k, v);
  }
  const qs = params.toString();
  const url = `${host.api}${path}${qs ? `?${qs}` : ''}`;
  const res = await transport(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    throw Object.assign(new Error('Hotmart rate limit (429)'), { retryable: true, status: 429 });
  }
  if (!res.ok) {
    throw new Error(`Hotmart GET ${path} falhou (${res.status}): ${await safeText(res)}`);
  }
  return res.json();
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}

/** Test seam. */
export function _resetTokenCache() {
  cache = { token: null, expiresAt: 0 };
}
