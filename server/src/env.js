// Loads .env from the repo root and exposes a typed-ish config object.
import dotenv from 'dotenv';
import { envPath } from './paths.js';

dotenv.config({ path: envPath });

const int = (v, dflt) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : dflt;
};

export const env = {
  port: int(process.env.PORT, 5275),
  encryptionKey: process.env.FINANCE_ENCRYPTION_KEY || '',
  debug: !!process.env.FINANCE_DEBUG,

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectPort: int(process.env.GOOGLE_OAUTH_REDIRECT_PORT, 5277),
  },

  hotmart: {
    clientId: process.env.HOTMART_CLIENT_ID || '',
    clientSecret: process.env.HOTMART_CLIENT_SECRET || '',
    basic: process.env.HOTMART_BASIC || '',
    environment: process.env.HOTMART_ENV || 'production',
    // Which commission role is "yours" when a sale has several parties.
    role: process.env.HOTMART_ROLE || 'PRODUCER',
  },
};

/** Case-insensitive env lookup (Windows env vars don't preserve case reliably). */
function findEnv(name) {
  if (process.env[name]) return process.env[name];
  const want = name.toUpperCase();
  for (const [k, v] of Object.entries(process.env)) {
    if (k.toUpperCase() === want && v) return v;
  }
  return '';
}

/**
 * OAuth client credentials for an account: its own override if present, else the shared
 * client. Overrides come from `GOOGLE_CLIENT_ID__<ACCOUNT>` / `GOOGLE_CLIENT_SECRET__<ACCOUNT>`.
 *
 * Why per-account: Google applies risk-based protections per Google Account on unverified
 * apps requesting sensitive scopes, and can hard-block one account while the others sail
 * through the same app. Such an account needs its own OAuth client, and it must NOT disturb
 * the accounts already working — a refresh token is only valid for the client that issued
 * it, so resolving the client by account name keeps every token paired with its own client
 * at both authorize and refresh time.
 */
export function googleCredentials(account) {
  if (account) {
    const suffix = String(account).toUpperCase();
    const clientId = findEnv(`GOOGLE_CLIENT_ID__${suffix}`);
    const clientSecret = findEnv(`GOOGLE_CLIENT_SECRET__${suffix}`);
    if (clientId && clientSecret) return { clientId, clientSecret, source: 'account' };
    if (clientId || clientSecret) {
      // Falling back to the shared client here would silently re-run the exact flow the
      // override exists to avoid, so fail loudly instead.
      throw new Error(
        `Credencial OAuth incompleta para "${account}": defina GOOGLE_CLIENT_ID__${suffix} e GOOGLE_CLIENT_SECRET__${suffix} no .env (ou remova os dois para usar o client compartilhado).`
      );
    }
  }
  return { clientId: env.google.clientId, clientSecret: env.google.clientSecret, source: 'shared' };
}

export function googleConfigured(account) {
  const { clientId, clientSecret } = googleCredentials(account);
  return !!(clientId && clientSecret);
}

export function hotmartConfigured() {
  return !!(env.hotmart.clientId && env.hotmart.clientSecret);
}
