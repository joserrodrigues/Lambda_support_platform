import { isManagedImageUrl, objectKeyFromUrl, stabilizeTicketImages } from '../../../src/modules/tickets/image-sign';
import { imageKind, ticketImageMime, ticketImagePath } from '../../../src/modules/tickets/image.storage';
import { conteudoVazio, preparePostContent, sanitizeTicketHtml } from '../../../src/shared/ticket-html';

describe('sanitizeTicketHtml', () => {
  it('should keep the editor tags and drop a script', () => {
    const html = '<p>Oi <strong>time</strong></p><script>alert(1)</script><img src="javascript:alert(1)" alt="x">';

    expect(sanitizeTicketHtml(html)).toBe('<p>Oi <strong>time</strong></p>');
  });

  it('should keep an http image and a link', () => {
    const html = '<a href="https://escola.example/t">chamado</a><img src="http://127.0.0.1:3000/ticket-images/a.jpg" alt="foto">';
    const clean = sanitizeTicketHtml(html);

    expect(clean).toContain('href="https://escola.example/t"');
    expect(clean).toContain('src="http://127.0.0.1:3000/ticket-images/a.jpg"');
    expect(sanitizeTicketHtml(clean)).toBe(clean);
  });

  it('should treat markup without text or image as empty', () => {
    expect(conteudoVazio('<p><br></p>')).toBe(true);
    expect(conteudoVazio('<p>Oi</p>')).toBe(false);
    expect(conteudoVazio('<img src="https://cdn.example/a.jpg" alt="">')).toBe(false);
  });

  it('should reject content that disappears after sanitizing', () => {
    expect(() => preparePostContent('<script>alert(1)</script>')).toThrow(
      'Escreva o registro antes de adicionar.',
    );
  });
});

describe('ticket image addresses', () => {
  it('should keep a local image and strip the signature from a private one', () => {
    expect(isManagedImageUrl('http://127.0.0.1:3000/ticket-images/a.jpg')).toBe(false);
    expect(objectKeyFromUrl('https://d2j2x01e904yhl.cloudfront.net/FSFAPI/supportTickets/a.jpg?X-Amz-Expires=1800')).toBe(
      'FSFAPI/supportTickets/a.jpg',
    );
    expect(
      stabilizeTicketImages(
        '<img src="https://s3.us-west-2.amazonaws.com/fsfprod/FSFAPI/supportTickets/a.jpg?X-Amz-Date=1" alt="">',
      ),
    ).toBe('<img src="https://d2j2x01e904yhl.cloudfront.net/FSFAPI/supportTickets/a.jpg" alt="">');
  });
});

describe('ticket images', () => {
  it('should recognize jpg, png, gif and webp by their bytes', () => {
    expect(imageKind(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('jpg');
    expect(imageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(imageKind(Buffer.from('GIF89a', 'ascii'))).toBe('gif');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    expect(imageKind(webp)).toBe('webp');
    expect(imageKind(Buffer.from('not-an-image'))).toBeNull();
  });

  it('should refuse a path outside the image folder', () => {
    expect(ticketImagePath('../segredo.jpg')).toBeNull();
    expect(ticketImagePath('a.jpg')).toBeNull();
    const name = '11111111-1111-1111-1111-111111111111.png';
    expect(ticketImagePath(name)).toMatch(/11111111-1111-1111-1111-111111111111\.png$/);
    expect(ticketImageMime(name)).toBe('image/png');
  });
});
