import crypto from 'node:crypto';

export function hashPassword(plaintext: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plaintext, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(plaintext, salt, 64);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
