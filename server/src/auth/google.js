// Google OAuth (loopback / Desktop client) + access-token refresh (S1.1).
// Refresh tokens are stored encrypted; access tokens live only in memory.
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../env.js';
import { log } from '../logger.js';
import { saveToken, getRefreshToken, markRefreshed, markRevoked } from './tokenStore.js';

export const YT_SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
  'openid',
  'email',
];

function redirectUri() {
  return `http://127.0.0.1:${env.google.redirectPort}/oauth2callback`;
}

function makeClient() {
  if (!env.google.clientId || !env.google.clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID/SECRET ausentes no .env (ver docs/setup-google.md)');
  }
  return new OAuth2Client(env.google.clientId, env.google.clientSecret, redirectUri());
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    /* user can paste the URL manually */
  }
}

function emailFromIdToken(idToken) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return payload.email || null;
  } catch {
    return null;
  }
}

/**
 * Interactive loopback authorization. Opens the browser, waits for the callback,
 * exchanges the code, and persists the refresh token under `account`.
 * For Brand Accounts (R2) the user picks the channel identity in the consent UI.
 */
export function authorizeAccount(db, account) {
  return new Promise((resolve, reject) => {
    const client = makeClient();
    const state = crypto.randomBytes(16).toString('hex');
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // force refresh_token even on re-auth
      scope: YT_SCOPES,
      state,
      include_granted_scopes: true,
    });

    const server = http.createServer(async (req, res) => {
      if (!req.url.startsWith('/oauth2callback')) {
        res.writeHead(404).end();
        return;
      }
      const params = new URL(req.url, redirectUri()).searchParams;
      if (params.get('state') !== state) {
        res.writeHead(400).end('state mismatch');
        return;
      }
      const err = params.get('error');
      if (err) {
        res.writeHead(400).end(`Autorização negada: ${err}`);
        server.close();
        reject(new Error(`Autorização negada: ${err}`));
        return;
      }
      try {
        const { tokens } = await client.getToken(params.get('code'));
        if (!tokens.refresh_token) {
          throw new Error(
            'Google não retornou refresh_token. Revogue o acesso em myaccount.google.com/permissions e reautorize (prompt=consent).'
          );
        }
        const email = emailFromIdToken(tokens.id_token);
        saveToken(db, { account, email, refreshToken: tokens.refresh_token, scope: YT_SCOPES.join(' ') });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
          `<html><body style="font-family:sans-serif;padding:2rem"><h2>✅ Conta "${account}" autorizada</h2><p>${email || ''}</p><p>Pode fechar esta aba e voltar ao terminal.</p></body></html>`
        );
        server.close();
        resolve({ account, email });
      } catch (e) {
        res.writeHead(500).end(`Erro: ${e.message}`);
        server.close();
        reject(e);
      }
    });

    server.on('error', reject);
    server.listen(env.google.redirectPort, '127.0.0.1', () => {
      log.info(`Abrindo o navegador para autorizar "${account}"…`);
      log.info(`Se não abrir, cole no navegador:\n${url}`);
      openBrowser(url);
    });
  });
}

/**
 * Returns a fresh access token for `account`. On invalid_grant (revoked/expired
 * refresh token) marks the account revoked and throws an actionable error (S1.1 AC).
 */
export async function getAccessToken(db, account) {
  const refreshToken = getRefreshToken(db, account);
  if (!refreshToken) {
    throw new Error(`Conta "${account}" sem token válido — rode: npm run auth -- --account ${account}`);
  }
  const client = makeClient();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('access token vazio');
    markRefreshed(db, account);
    return token;
  } catch (e) {
    const msg = e?.response?.data?.error || e.message || '';
    if (/invalid_grant/i.test(msg)) {
      markRevoked(db, account);
      throw new Error(`Token da conta "${account}" foi revogado/expirou. Reautorize: npm run auth -- --account ${account}`);
    }
    throw e;
  }
}
