import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const SECRET_KEY_ENV = 'KDAN_SOCIAL_SECRET_KEY';
const VERSION = 'v1';

export class SecretKeyError extends Error {}
export class DecryptError extends Error {}

/** Return a new random key for `KDAN_SOCIAL_SECRET_KEY`, base64-encoded. */
export function generateKey(): string {
  return randomBytes(32).toString('base64');
}

/**
 * Read the encryption key from the environment.
 *
 * Raises:
 *   SecretKeyError: the variable is missing or is not 32 bytes of base64.
 */
export function loadKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env[SECRET_KEY_ENV];
  if (!raw) throw new SecretKeyError(`${SECRET_KEY_ENV} is not set`);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new SecretKeyError(`${SECRET_KEY_ENV} must be 32 bytes of base64, got ${key.length} bytes`);
  return key;
}

/**
 * Encrypt `plain` with AES-256-GCM.
 *
 * `context` is bound as associated data, so a ciphertext copied onto another
 * account's row fails to decrypt instead of handing that account a stranger's token.
 */
export function encrypt(plain: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), body].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

/**
 * Decrypt a value produced by `encrypt` with the same key and context.
 *
 * Raises:
 *   DecryptError: the value is malformed, or the key or context differs from the one it was saved with.
 */
export function decrypt(sealed: string, key: Buffer, context: string): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || body === undefined) throw new DecryptError('Unrecognised ciphertext format');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new DecryptError('Credentials could not be decrypted; the key or account changed since they were saved, so reconnect the account');
  }
}

/** The associated data for one account's credentials. */
export function accountContext(a: { workspaceId: string; platform: string; externalId: string }): string {
  return `${a.workspaceId}:${a.platform}:${a.externalId}`;
}
