import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { googleCredentials, googleConfigured } from '../src/env.js';

const OVERRIDE_KEYS = [
  'GOOGLE_CLIENT_ID__SATISFYING_VISUALS',
  'GOOGLE_CLIENT_SECRET__SATISFYING_VISUALS',
  'GOOGLE_CLIENT_ID__satisfying_visuals',
  'GOOGLE_CLIENT_SECRET__satisfying_visuals',
];

describe('googleCredentials — per-account OAuth client', () => {
  let saved;

  beforeEach(() => {
    saved = {};
    for (const k of OVERRIDE_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of OVERRIDE_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('falls back to the shared client when the account has no override', () => {
    const c = googleCredentials('redef_de');
    expect(c.source).toBe('shared');
  });

  it('uses the account override when both halves are set', () => {
    process.env.GOOGLE_CLIENT_ID__SATISFYING_VISUALS = 'own-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET__SATISFYING_VISUALS = 'own-secret';

    const c = googleCredentials('satisfying_visuals');
    expect(c).toMatchObject({ clientId: 'own-id.apps.googleusercontent.com', clientSecret: 'own-secret', source: 'account' });
  });

  // The isolation guarantee: a refresh token is only valid for the client that issued it,
  // so an override must never leak onto another account — that would invalidate the tokens
  // of channels that already work and get them marked revoked on the next sync.
  it('does not leak an override onto other accounts or the shared client', () => {
    process.env.GOOGLE_CLIENT_ID__SATISFYING_VISUALS = 'own-id';
    process.env.GOOGLE_CLIENT_SECRET__SATISFYING_VISUALS = 'own-secret';

    for (const other of ['redef_de', 'redef_fr', 'orchestral_a', 'cortes_de']) {
      expect(googleCredentials(other).source).toBe('shared');
      expect(googleCredentials(other).clientId).not.toBe('own-id');
    }
    expect(googleCredentials(undefined).source).toBe('shared');
  });

  it('matches the override case-insensitively (Windows env vars)', () => {
    process.env.GOOGLE_CLIENT_ID__satisfying_visuals = 'lower-id';
    process.env.GOOGLE_CLIENT_SECRET__satisfying_visuals = 'lower-secret';

    expect(googleCredentials('satisfying_visuals')).toMatchObject({ clientId: 'lower-id', source: 'account' });
  });

  it('throws instead of silently falling back when only half the override is set', () => {
    process.env.GOOGLE_CLIENT_ID__SATISFYING_VISUALS = 'own-id';

    expect(() => googleCredentials('satisfying_visuals')).toThrow(/GOOGLE_CLIENT_SECRET__SATISFYING_VISUALS/);
    expect(() => googleConfigured('satisfying_visuals')).toThrow();
  });
});
