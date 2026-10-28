import type { AiProvider, AiSettings } from './ai.types';

const PROMPT = `Você melhora o texto de um colaborador do suporte da School Guardian antes do envio à escola.
Mantenha os fatos, prazos e decisões. Não invente solução, passo, prazo ou promessa.
Escreva em português do Brasil, com tom educado e simples.
Se o texto tiver HTML, preserve as tags permitidas (p, br, strong, b, em, i, u, ul, ol, li, a, img, span) e os endereços de imagem e de link.
Devolva somente o texto melhorado, sem explicação e sem cercar com markdown.`;

export function defaultBaseUrl(provider: AiProvider): string {
  return provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
}

export function defaultModel(provider: AiProvider): string {
  return provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini';
}

export function stripModelText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:html|text|markdown)?\s*([\s\S]*?)```$/i);
  return (fence?.[1] ?? trimmed).trim();
}

function endpoint(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  if (base.endsWith('/v1') && path.startsWith('/v1/')) return `${base}${path.slice(3)}`;
  return `${base}${path}`;
}

export function improveRequest(settings: AiSettings, text: string): { url: string; init: RequestInit } {
  const user = `${PROMPT}\n\nTEXTO\n${text}`;
  if (settings.provider === 'anthropic') {
    return {
      url: endpoint(settings.baseUrl, '/v1/messages'),
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 2000,
          messages: [{ role: 'user', content: user }],
        }),
      },
    };
  }
  return {
    url: endpoint(settings.baseUrl, '/chat/completions'),
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        messages: [{ role: 'user', content: user }],
      }),
    },
  };
}

export function readImproveResponse(provider: AiProvider, body: unknown): string {
  if (provider === 'anthropic') {
    const blocks = (body as { content?: { text?: string }[] } | null)?.content ?? [];
    return stripModelText(blocks.map((block) => block.text ?? '').join(''));
  }
  const content = (body as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0]
    ?.message?.content;
  return stripModelText(typeof content === 'string' ? content : '');
}
