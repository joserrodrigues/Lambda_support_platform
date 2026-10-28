import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Errors } from '../../shared/errors';

const MAX_BYTES = 5 * 1024 * 1024;

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

const IMAGE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|webp)$/i;

export type ImageKind = 'jpg' | 'png' | 'gif' | 'webp';

export function ticketImageDir(): string {
  return path.resolve(process.cwd(), 'storage', 'ticket-images');
}

export function imageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  if (buffer.length >= 6) {
    const gif = buffer.subarray(0, 6).toString('ascii');
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function ticketImagePath(name: string): string | null {
  if (!IMAGE_NAME.test(name)) return null;
  const dir = ticketImageDir();
  const full = path.resolve(dir, name);
  if (!full.startsWith(dir + path.sep)) return null;
  return full;
}

export function ticketImageMime(name: string): string | null {
  const match = IMAGE_NAME.exec(name);
  const ext = match?.[1]?.toLowerCase();
  if (!ext) return null;
  return MIME[ext] ?? null;
}

/** Disco local. Hom e prod gravam no bucket privado e assinam na leitura. */
export async function saveTicketImage(buffer: Buffer): Promise<{ name: string }> {
  if (buffer.length > MAX_BYTES) {
    throw Errors.unprocessable('A imagem pode ter no máximo 5 MB.');
  }
  const kind = imageKind(buffer);
  if (!kind) throw Errors.unprocessable('Use uma imagem jpg, png, gif ou webp.');
  const name = `${randomUUID()}.${kind}`;
  await mkdir(ticketImageDir(), { recursive: true });
  await writeFile(path.join(ticketImageDir(), name), buffer);
  return { name };
}
