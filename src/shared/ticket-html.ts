import { Errors } from './errors';

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'img', 'span']);

function decodeBasic(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeAttr(value: string): string {
  return decodeBasic(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function attr(attrs: string, name: string): string | null {
  const match = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'),
  );
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? '').trim();
}

function safeLinkUrl(value: string | null): string | null {
  if (!value) return null;
  const url = decodeBasic(value).trim();
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  return null;
}

function safeImageUrl(value: string | null): string | null {
  if (!value) return null;
  const url = decodeBasic(value).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\/(?:local-photo|ticket-images)\//i.test(url)) return url;
  return null;
}

/** HTML do editor: negrito, itálico, sublinhado, listas, link e imagem. O resto sai. */
export function sanitizeTicketHtml(html: string): string {
  const withoutBlocks = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '');

  return withoutBlocks.replace(
    /<\/?([a-zA-Z0-9]+)(\s[^<>]*)?>/g,
    (full, rawTag: string, rawAttrs: string | undefined) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED.has(tag)) return '';
      if (full.startsWith('</')) return tag === 'br' ? '' : `</${tag}>`;
      if (tag === 'br') return '<br>';
      if (tag === 'img') {
        const src = safeImageUrl(attr(rawAttrs ?? '', 'src'));
        if (!src) return '';
        const alt = escapeAttr(attr(rawAttrs ?? '', 'alt') ?? '');
        return `<img src="${escapeAttr(src)}" alt="${alt}">`;
      }
      if (tag === 'a') {
        const href = safeLinkUrl(attr(rawAttrs ?? '', 'href'));
        if (!href) return '<a>';
        return `<a href="${escapeAttr(href)}" rel="noopener noreferrer">`;
      }
      return `<${tag}>`;
    },
  );
}

export function conteudoVazio(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  if (text.length > 0) return false;
  return !/<img\b/i.test(html);
}

export function preparePostContent(raw: string): string {
  const clean = sanitizeTicketHtml(raw);
  if (conteudoVazio(clean)) {
    throw Errors.unprocessable('Escreva o registro antes de adicionar.');
  }
  return clean;
}
