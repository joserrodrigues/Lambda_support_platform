import { createHmac } from 'node:crypto';

/** Mesmo contrato do `ApiAuthVerifier` do FSFAPI. */
export const API_AUTH_SKEW_SECONDS = 300;

const PLACEHOLDERS = ['%Y%', '%m%', '%d%', '%H%', '%i%', '%s%'] as const;

export function mountApiSecret(secret: string, date: string): string {
  const parts = dateParts(date);
  if (!parts) return secret;
  return PLACEHOLDERS.reduce((value, token, index) => value.replaceAll(token, parts[index] ?? ''), secret);
}

export function createApiHash(secret: string, date: string, payloadWithoutHash: Record<string, unknown>): string {
  const body: Record<string, unknown> = { ...payloadWithoutHash, date };
  delete body.hash;
  return hmacHex(mountApiSecret(secret, date), canonicalJson(body));
}

export function verifyApiAuth(secret: string, date: string, payload: Record<string, unknown>): boolean {
  if (!isApiDateFresh(date)) return false;
  if (!secret.trim()) return false;
  const received = String(payload.hash ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  const body = { ...payload };
  delete body.hash;
  const expected = hmacHex(mountApiSecret(secret, date), canonicalJson(body));
  return expected.length === received.length && timingSafeEqualHex(expected, received);
}

export function isApiDateFresh(date: string, maxSkewSeconds = API_AUTH_SKEW_SECONDS): boolean {
  const parsed = parseApiDate(date);
  if (!parsed) return false;
  return Math.abs(Date.now() - parsed.getTime()) <= maxSkewSeconds * 1000;
}

/** JSON ordenado, sem espaços, barras literais e acentos em `\uXXXX`, como o `json_encode` do PHP. */
export function canonicalJson(payload: Record<string, unknown>): string {
  return encode(normalize(payload));
}

function dateParts(date: string): string[] | null {
  const dashed = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(date.trim());
  if (dashed) return dashed.slice(1);
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(date.trim());
  return compact ? compact.slice(1) : null;
}

function parseApiDate(date: string): Date | null {
  const parts = dateParts(date);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const back = parsed.toISOString().slice(0, 19).replace('T', ' ');
  const compact = `${year}${month}${day}${hour}${minute}${second}`;
  const original = date.trim();
  if (original !== back && original !== compact) return null;
  return parsed;
}

function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret.trim()).update(message).digest('hex');
}

function timingSafeEqualHex(left: string, right: string): boolean {
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = normalize(item);
    return out;
  }
  if (typeof value === 'boolean' || typeof value === 'number' || value === null) return value;
  return String(value ?? '');
}

function encode(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${quote(key)}:${encode(record[key])}`).join(',')}}`;
}

function quote(value: string): string {
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '"') out += '\\"';
    else if (char === '\\') out += '\\\\';
    else if (char === '\b') out += '\\b';
    else if (char === '\f') out += '\\f';
    else if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (char === '\t') out += '\\t';
    else if (code < 0x20 || code > 0x7f) out += unicodeEscape(char);
    else out += char;
  }
  return `${out}"`;
}

function unicodeEscape(char: string): string {
  return [...char].map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
}
