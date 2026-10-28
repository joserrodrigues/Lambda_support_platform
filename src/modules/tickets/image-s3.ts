import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { currentDatabaseTarget } from '../../database/context';
import type { DatabaseTarget } from '../../database/routing';
import { Errors } from '../../shared/errors';
import {
  DEFAULT_TICKET_IMAGE_BASE,
  TICKET_IMAGE_SIGN_MINUTES,
  isManagedImageUrl,
  objectKeyFromUrl,
  rewriteImageSrcs,
  stabilizeTicketImages,
} from './image-sign';
import { imageKind, type ImageKind } from './image.storage';

const MIME: Record<ImageKind, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

export interface TicketImageEnv {
  bucket: string;
  region: string;
  baseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
}

let client: S3Client | undefined;
let clientKey = '';

export function readTicketImageEnv(source: NodeJS.ProcessEnv = process.env): TicketImageEnv {
  return {
    bucket: source.AWS_S3_BUCKET?.trim() || '',
    region: source.AWS_S3_REGION?.trim() || 'us-west-2',
    baseUrl: source.AWS_S3_URL?.trim() || DEFAULT_TICKET_IMAGE_BASE,
    accessKeyId: source.AWS_S3_KEY?.trim() || '',
    secretAccessKey: source.AWS_S3_SECRET?.trim() || '',
  };
}

export function signsTicketImages(target: DatabaseTarget | undefined): boolean {
  return target === 'hom' || target === 'prod';
}

function s3(env: TicketImageEnv): S3Client {
  const key = `${env.region}:${env.accessKeyId}`;
  if (!client || clientKey !== key) {
    client = new S3Client({
      region: env.region,
      ...(env.accessKeyId && env.secretAccessKey
        ? { credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey } }
        : {}),
    });
    clientKey = key;
  }
  return client;
}

export async function presignTicketImage(key: string, env: TicketImageEnv): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.bucket, Key: key });
  return getSignedUrl(s3(env), command, { expiresIn: TICKET_IMAGE_SIGN_MINUTES * 60 });
}

/** Hom e prod: objeto no bucket privado. A resposta é a URL assinada para o editor mostrar agora. */
export async function saveTicketImagePrivate(buffer: Buffer): Promise<{ url: string }> {
  const env = readTicketImageEnv();
  if (!env.bucket) {
    throw Errors.serviceUnavailable('O envio de imagem neste ambiente não está configurado.');
  }
  const kind = imageKind(buffer);
  if (!kind) throw Errors.unprocessable('Use uma imagem jpg, png, gif ou webp.');
  if (buffer.length > 5 * 1024 * 1024) {
    throw Errors.unprocessable('A imagem pode ter no máximo 5 MB.');
  }
  const key = `supportTickets/${randomUUID()}.${kind}`;
  await s3(env).send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      Body: buffer,
      ContentType: MIME[kind],
    }),
  );
  return { url: await presignTicketImage(key, env) };
}

/** Na leitura, troca a URL estável pela assinatura de 30 minutos. No local não mexe. */
export async function signTicketHtml(html: string): Promise<string> {
  if (!signsTicketImages(currentDatabaseTarget()) || !html.includes('<img')) return html;
  const env = readTicketImageEnv();
  if (!env.bucket) return html;

  const pending = new Map<string, string>();
  rewriteImageSrcs(html, (src) => {
    if (isManagedImageUrl(src)) pending.set(src, src);
    return src;
  });
  for (const src of pending.keys()) {
    const key = objectKeyFromUrl(src, [env.bucket]);
    if (!key) continue;
    pending.set(src, await presignTicketImage(key, env));
  }
  return rewriteImageSrcs(html, (src) => pending.get(src) ?? src);
}

export function storedTicketImageHtml(html: string): string {
  const env = readTicketImageEnv();
  return stabilizeTicketImages(html, env.baseUrl, env.bucket);
}
