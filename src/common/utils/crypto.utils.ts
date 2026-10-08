import * as crypto from 'crypto';

export const ENV = (k: string, d = '') => process.env[k] ?? d;

export const rid = (n = 10) =>
  crypto.randomBytes(n).toString('base64url').slice(0, n);

export const sha = (s: string) =>
  crypto.createHash('sha256').update(s).digest('hex');

export const aesKey = () =>
  crypto.createHash('sha256').update(ENV('JWT_SECRET', 'nerkanal-dev-secret')).digest();

export const enc = (s: string) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aesKey(), iv);
  const e = Buffer.concat([c.update(s), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), e]).toString('base64');
};

export const dec = (s: string) => {
  const b = Buffer.from(s, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', aesKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString();
};
