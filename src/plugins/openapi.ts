import swagger from '@fastify/swagger';
import fp from 'fastify-plugin';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';
import { ACCESS_TOKEN_EXPIRES_HEADER, ACCESS_TOKEN_HEADER } from './auth';

type Transform = typeof jsonSchemaTransform;
type JsonObject = Record<string, unknown>;

const errorSchema: JsonObject = {
  type: 'object',
  required: ['statusCode', 'code', 'message'],
  properties: {
    statusCode: { type: 'integer' },
    code: { type: 'string' },
    message: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        required: ['field', 'message'],
        properties: { field: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
};

const errorResponse = (description: string): JsonObject => ({
  description,
  content: { 'application/json': { schema: errorSchema } },
});

const renewedTokenHeaders: JsonObject = {
  [ACCESS_TOKEN_HEADER]: {
    type: 'string',
    description:
      'Novo Bearer token (validade renovada). O cliente deve substituir o token armazenado por este valor.',
  },
  [ACCESS_TOKEN_EXPIRES_HEADER]: {
    type: 'string',
    description: 'Validade do novo token, em segundos.',
    example: '600',
  },
};

/**
 * Converte os schemas Zod das rotas e acrescenta o que é comum a toda a API:
 * segurança Bearer (exceto rotas com `security: []`), headers de renovação do token
 * e respostas de erro padronizadas.
 */
/**
 * operationId (nome das funções no client gerado pelo frontend) e resumo de cada rota.
 * A geração falha se uma rota nova não estiver aqui, para manter a documentação completa.
 */
const OPERATIONS: Record<string, [operationId: string, summary: string]> = {
  'GET /health': ['getHealth', 'Verifica se a API está disponível'],
  'POST /auth/login': ['login', 'Autentica por e-mail e senha e retorna um Bearer token (10 min)'],
  'GET /auth/me': ['getCurrentUser', 'Retorna o usuário autenticado'],
  'POST /auth/logout': ['logout', 'Encerra a sessão revogando todos os tokens do usuário'],
  'POST /users': ['createUser', 'Cria um usuário (admin)'],
  'GET /users': ['listUsers', 'Lista usuários com paginação (admin)'],
  'GET /users/:id': ['getUser', 'Detalha um usuário (admin ou o próprio)'],
  'PATCH /users/:id': ['updateUser', 'Atualiza um usuário (admin ou o próprio)'],
  'DELETE /users/:id': ['deleteUser', 'Exclui logicamente um usuário (admin)'],
  'GET /tickets/options': ['getTicketOptions', 'Valores e rótulos dos campos de domínio do ticket'],
  'POST /tickets': ['createTicket', 'Cria um ticket'],
  'GET /tickets': ['listTickets', 'Lista tickets com filtros e paginação'],
  'GET /tickets/:id': ['getTicket', 'Detalha um ticket'],
  'PATCH /tickets/:id': ['updateTicket', 'Atualiza um ticket (null limpa campos opcionais)'],
  'DELETE /tickets/:id': ['deleteTicket', 'Exclui um ticket e seus posts (admin)'],
  'POST /tickets/:id/posts': ['createTicketPost', 'Adiciona um post ao ticket'],
  'GET /tickets/:id/posts': ['listTicketPosts', 'Lista os posts do ticket (mais antigos primeiro)'],
  'PATCH /tickets/:id/posts/:postId': ['updateTicketPost', 'Edita um post (autor ou admin)'],
  'DELETE /tickets/:id/posts/:postId': ['deleteTicketPost', 'Exclui um post (autor ou admin)'],
};

/** Respostas de erro específicas de cada rota (além das comuns). */
const ROUTE_ERRORS: Record<string, Record<string, string>> = {
  'POST /auth/login': { '401': 'Credenciais inválidas' },
  'POST /users': { '409': 'E-mail ou login já cadastrado' },
  'PATCH /users/:id': { '404': 'Usuário não encontrado', '409': 'E-mail ou login já cadastrado' },
  'GET /users/:id': { '404': 'Usuário não encontrado' },
  'DELETE /users/:id': { '404': 'Usuário não encontrado' },
  'POST /tickets': { '422': 'Escola não encontrada' },
  'GET /tickets/:id': { '404': 'Ticket não encontrado' },
  'PATCH /tickets/:id': { '404': 'Ticket não encontrado', '422': 'Escola não encontrada' },
  'DELETE /tickets/:id': { '404': 'Ticket não encontrado' },
  'POST /tickets/:id/posts': { '404': 'Ticket não encontrado' },
  'GET /tickets/:id/posts': { '404': 'Ticket não encontrado' },
  'PATCH /tickets/:id/posts/:postId': { '404': 'Post não encontrado (ou não pertence ao ticket)' },
  'DELETE /tickets/:id/posts/:postId': { '404': 'Post não encontrado (ou não pertence ao ticket)' },
};

export const openApiTransform: Transform = (input) => {
  const result = jsonSchemaTransform(input);
  const method = Array.isArray(input.route.method) ? input.route.method[0] : input.route.method;
  // Rotas automáticas (preflight do CORS e HEAD) não entram na documentação.
  if (method === 'OPTIONS' || method === 'HEAD') {
    return { ...result, schema: { ...result.schema, hide: true } };
  }
  // Rotas sem schema ou ocultadas explicitamente não são documentadas.
  if (!(result.schema as typeof result.schema | undefined) || result.schema.hide) return result;

  const schema = result.schema as typeof result.schema & {
    response?: Record<string, JsonObject>;
  };
  const isPublic = Array.isArray(schema.security) && schema.security.length === 0;
  const response: Record<string, JsonObject> = { ...(schema.response ?? {}) };

  if (!isPublic) {
    for (const [status, value] of Object.entries(response)) {
      if (status.startsWith('2')) response[status] = { ...value, headers: renewedTokenHeaders };
    }
    response['401'] ??= errorResponse('Token ausente, inválido, expirado ou revogado');
    response['403'] ??= errorResponse('Usuário sem permissão para este recurso');
  }
  const hasInput = Boolean(schema.body ?? schema.querystring ?? schema.params);
  if (hasInput) response['400'] ??= errorResponse('Dados inválidos (VALIDATION_ERROR)');
  const key = `${String(method)} ${input.url.replace(/(.)\/$/, '$1')}`;
  const operation = OPERATIONS[key];
  if (!operation) throw new Error(`Rota sem operationId/summary no OpenAPI: ${key}`);
  for (const [status, description] of Object.entries(ROUTE_ERRORS[key] ?? {})) {
    response[status] ??= errorResponse(description);
  }
  response['429'] ??= errorResponse('Limite de requisições excedido');
  response['500'] ??= errorResponse('Erro interno do servidor');

  const [operationId, summary] = operation;
  return { ...result, schema: { ...schema, operationId, summary, response } };
};

export interface OpenApiPluginOptions {
  version?: string;
  servers?: {
    url: string;
    description?: string;
    variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
  }[];
}

export default fp<OpenApiPluginOptions>(
  async (fastify, { version = '0.1.0', servers = [] }) => {
    await fastify.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          license: { name: 'Proprietary' },
          title: 'School Guardian — Support Platform API',
          version,
          description: [
            'API de gerenciamento de tickets da School Guardian.',
            '',
            '## Autenticação',
            '1. `POST /auth/login` com e-mail e senha retorna um Bearer token válido por **10 minutos**.',
            '2. Envie `Authorization: Bearer <token>` em todas as rotas protegidas.',
            '3. **Toda resposta autenticada retorna um token renovado no header `X-Access-Token`** ' +
              '(e `X-Access-Token-Expires-In`). Substitua o token armazenado por esse valor a cada resposta.',
            '4. A sessão expira após 10 min sem uso ou ao atingir o tempo máximo (padrão 8h desde o login).',
            '5. `POST /auth/logout`, troca de senha e desativação revogam todos os tokens do usuário.',
            '',
            '## Erros',
            'Todas as respostas de erro seguem o formato `{ statusCode, code, message, details? }`.',
          ].join('\n'),
        },
        servers,
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        security: [{ bearerAuth: [] }],
        tags: [
          { name: 'health', description: 'Verificação de disponibilidade' },
          { name: 'auth', description: 'Login, sessão e logout' },
          { name: 'users', description: 'Gestão de usuários' },
          { name: 'tickets', description: 'Tickets de suporte' },
          { name: 'posts', description: 'Posts (interações) dos tickets' },
        ],
      },
      transform: openApiTransform,
      transformObject: jsonSchemaTransformObject,
    });
  },
  { name: 'openapi' },
);
