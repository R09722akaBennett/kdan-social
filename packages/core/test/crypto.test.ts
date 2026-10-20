import { describe, expect, it } from 'vitest';
import { decrypt, DecryptError, encrypt, generateKey, loadKey, SecretKeyError } from '../src/crypto';

const key = Buffer.from(generateKey(), 'base64');

describe('crypto', () => {
  it('round-trips a value under the same key and context', () => {
    const sealed = encrypt('token-123', key, 'ws:facebook:page-1');
    expect(sealed).not.toContain('token-123');
    expect(decrypt(sealed, key, 'ws:facebook:page-1')).toBe('token-123');
  });

  it('refuses a ciphertext moved to another account', () => {
    const sealed = encrypt('token-123', key, 'ws:facebook:page-1');
    expect(() => decrypt(sealed, key, 'ws:facebook:page-2')).toThrow(DecryptError);
  });

  it('refuses a ciphertext under a different key', () => {
    const sealed = encrypt('token-123', key, 'ctx');
    expect(() => decrypt(sealed, Buffer.from(generateKey(), 'base64'), 'ctx')).toThrow(DecryptError);
  });

  it('rejects malformed input instead of crashing', () => {
    expect(() => decrypt('not-a-ciphertext', key, 'ctx')).toThrow(DecryptError);
  });

  it('requires a 32-byte key', () => {
    expect(() => loadKey({})).toThrow(SecretKeyError);
    expect(() => loadKey({ KDAN_SOCIAL_SECRET_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/32 bytes/);
    expect(loadKey({ KDAN_SOCIAL_SECRET_KEY: generateKey() })).toHaveLength(32);
  });
});
