import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
// Fixed, app-specific salt for key derivation - not a secret itself, just
// domain-separates this key from any other use of JWT_SECRET as key material.
const KDF_SALT = 'kaziyangu-settings-v1';

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, KDF_SALT, 32);
}

/**
 * Encrypts an arbitrary JSON-serializable value with AES-256-GCM, keyed off
 * `secret` (in practice, the app's JWT_SECRET - see modules/settings). Used
 * to store SMS gateway credentials at rest without a dedicated encryption
 * key/env var to manage.
 *
 * Output is `<iv>.<authTag>.<ciphertext>`, each base64.
 */
export function encryptJson(secret: string, data: unknown): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.');
}

/** Reverses {@link encryptJson}. Throws if `secret` is wrong or the payload was tampered with. */
export function decryptJson<T = unknown>(secret: string, payload: string): T {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload');

  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}
