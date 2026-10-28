/** Mesmos endereços que o FSFWEB usa em S3Services::getS3Object. */
const MANAGED_HOSTS = [
  'd2j2x01e904yhl.cloudfront.net',
  'fsfprod.s3.us-west-2.amazonaws.com',
  'fsfprod',
  'files.schoolguardian.app',
  'files.filhosemfila.com.br',
  'd2rxsrs9c4ak8a.cloudfront.net',
  'fsf-files-prod',
  's3.us-west-2.amazonaws.com',
  'sg-bulling-detector.s3.us-west-2.amazonaws.com',
];

const KNOWN_BUCKETS = ['fsfprod', 'fsf-files-prod', 'school-guardian-public-files'];

export const TICKET_IMAGE_SIGN_MINUTES = 30;
export const DEFAULT_TICKET_IMAGE_BASE = 'https://d2j2x01e904yhl.cloudfront.net/';

export function isManagedImageUrl(url: string): boolean {
  return MANAGED_HOSTS.some((host) => url.includes(host));
}

function decodeBasic(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Chave do objeto, sem a query da assinatura. */
export function objectKeyFromUrl(url: string, extraBuckets: string[] = []): string | null {
  const raw = decodeBasic(url).trim();
  if (!isManagedImageUrl(raw)) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  let path = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const buckets = new Set([...KNOWN_BUCKETS, ...extraBuckets.filter(Boolean)]);
  const first = path.split('/')[0];
  if (first && buckets.has(first)) path = path.slice(first.length + 1);
  if (!path || path.includes('..')) return null;
  return path;
}

export function canonicalTicketImageUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${key.replace(/^\//, '')}`;
}

/**
 * Grava a URL estável (sem assinatura). A assinatura de 30 minutos entra só na leitura.
 */
export function stabilizeTicketImages(
  html: string,
  baseUrl = process.env.AWS_S3_URL?.trim() || DEFAULT_TICKET_IMAGE_BASE,
  bucket = process.env.AWS_S3_BUCKET?.trim() || '',
): string {
  return rewriteImageSrcs(html, (src) => {
    const key = objectKeyFromUrl(src, bucket ? [bucket] : []);
    if (!key) return src;
    return canonicalTicketImageUrl(baseUrl, key);
  });
}

export function rewriteImageSrcs(html: string, map: (src: string) => string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i, (_full, doubleQuoted: string | undefined, singleQuoted: string | undefined) => {
      const raw = doubleQuoted ?? singleQuoted ?? '';
      const quote = doubleQuoted !== undefined ? '"' : "'";
      return `src=${quote}${escapeAttr(map(decodeBasic(raw)))}${quote}`;
    }),
  );
}
