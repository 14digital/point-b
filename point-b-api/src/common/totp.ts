import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Time-based one-time codes (RFC 6238), as used by Google Authenticator, 1Password, Authy and others. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string) {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

function codeAt(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Accepts the current code and the ones either side of it, to allow for a phone clock that is slightly off. */
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  const c = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  return [-1, 0, 1].some((d) => {
    const want = Buffer.from(codeAt(secret, counter + d));
    return timingSafeEqual(want, Buffer.from(c));
  });
}

export const otpauthUrl = (secret: string, account: string, issuer = 'POINT B Mentors') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

/** Ten single-use backup codes like "7F3K-9QPA", for when the phone isn't to hand. Only hashes are stored. */
export function newRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecovery) };
}
export const hashRecovery = (code: string) => createHash('sha256').update(code.replace(/[^A-Z0-9]/gi, '').toUpperCase()).digest('hex');
