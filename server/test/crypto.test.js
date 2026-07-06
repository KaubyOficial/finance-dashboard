import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { encrypt, decrypt, _setKeyForTests } from '../src/auth/crypto.js';

describe('token encryption', () => {
  it('round-trips a refresh token', () => {
    _setKeyForTests(crypto.randomBytes(32));
    const secret = '1//refresh-token-abc.DEF';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('fails to decrypt tampered ciphertext', () => {
    _setKeyForTests(crypto.randomBytes(32));
    const blob = encrypt('hello');
    const [iv, tag] = blob.split(':');
    const tampered = [iv, tag, Buffer.from('zzzz').toString('base64')].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('fails under a different key', () => {
    _setKeyForTests(crypto.randomBytes(32));
    const blob = encrypt('secret');
    _setKeyForTests(crypto.randomBytes(32));
    expect(() => decrypt(blob)).toThrow();
  });
});
