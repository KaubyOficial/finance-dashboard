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

export function googleConfigured() {
  return !!(env.google.clientId && env.google.clientSecret);
}

export function hotmartConfigured() {
  return !!(env.hotmart.clientId && env.hotmart.clientSecret);
}
