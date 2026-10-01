import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Hash de senha com scrypt (recomendado pela OWASP Password Storage Cheat Sheet).
 * Formato armazenado: scrypt$N$r$p$saltBase64$hashBase64
 * Usa apenas o módulo nativo `node:crypto` (sem binários nativos, compatível com Lambda).
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DEFAULT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
// Margem de memória para o scrypt: 128 * N * r * p bytes (~32 MiB com os parâmetros padrão).
const MAX_MEM = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = DEFAULT_PARAMS;
  const key = await deriveKey(password, salt, { N, r, p, maxmem: MAX_MEM });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![N, r, p].every((n) => Number.isSafeInteger(n) && n > 0)) return false;

  const expected = Buffer.from(hashB64, 'base64');
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await deriveKey(password, Buffer.from(saltB64, 'base64'), {
    N,
    r,
    p,
    maxmem: MAX_MEM,
  });
  return timingSafeEqual(actual, expected);
}

/**
 * Hash fixo usado quando o usuário não existe no login, para que o tempo de
 * resposta seja equivalente e não permita enumeração de e-mails.
 */
let dummyHashPromise: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('hex'));
  return dummyHashPromise;
}
