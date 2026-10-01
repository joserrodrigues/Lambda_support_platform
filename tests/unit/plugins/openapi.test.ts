import type { FastifyInstance } from 'fastify';
import type { OpenAPIV3_1 } from 'openapi-types';
import { z } from 'zod';
import { buildApp } from '../../../src/app';
import { openApiTransform, type OpenApiPluginOptions } from '../../../src/plugins/openapi';
import {
  fakeHasher,
  InMemoryPostRepository,
  InMemorySchoolRepository,
  InMemoryTicketRepository,
  InMemoryUserRepository,
  testConfig,
} from '../../helpers/fakes';

type Operation = OpenAPIV3_1.OperationObject;
type Responses = Record<string, OpenAPIV3_1.ResponseObject>;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

function operationsOf(doc: OpenAPIV3_1.Document) {
  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item?.[method];
      return operation ? [{ key: `${method.toUpperCase()} ${path}`, path, operation }] : [];
    }),
  );
}

const responsesOf = (operation: Operation) => operation.responses as Responses;

describe('OpenAPI', () => {
  let app: FastifyInstance;
  let doc: OpenAPIV3_1.Document;

  async function buildDocApp(openapi: OpenApiPluginOptions) {
    const instance = await buildApp({
      config: testConfig,
      userRepository: new InMemoryUserRepository(),
      ticketRepository: new InMemoryTicketRepository(),
      postRepository: new InMemoryPostRepository(),
      schoolRepository: new InMemorySchoolRepository(),
      hasher: fakeHasher,
      logger: false,
      openapi,
    });
    await instance.ready();
    return instance;
  }

  beforeAll(async () => {
    app = await buildDocApp({});
    doc = app.swagger() as OpenAPIV3_1.Document;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('document', () => {
    it('should use OpenAPI 3.1 with default version, no servers and bearer security', () => {
      expect(doc.openapi).toBe('3.1.0');
      expect(doc.info.version).toBe('0.1.0');
      expect(doc.servers).toEqual([]);
      expect(doc.security).toEqual([{ bearerAuth: [] }]);
      expect(doc.components?.securitySchemes).toEqual({
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      });
    });

    it('should use the version and servers given in the options', async () => {
      const custom = await buildDocApp({
        version: '9.9.9',
        servers: [{ url: 'https://api.example.test' }],
      });

      const customDoc = custom.swagger() as OpenAPIV3_1.Document;
      await custom.close();

      expect(customDoc.info.version).toBe('9.9.9');
      expect(customDoc.servers).toEqual([{ url: 'https://api.example.test' }]);
    });

    it('should document exactly the 19 operations, hiding OPTIONS and HEAD', () => {
      const keys = operationsOf(doc).map(({ key }) => key);

      expect(keys).toHaveLength(19);
      expect(keys.some((key) => key.startsWith('OPTIONS') || key.startsWith('HEAD'))).toBe(false);
    });

    it('should give every operation a unique operationId and a summary', () => {
      const operations = operationsOf(doc).map(({ operation }) => operation);
      const ids = operations.map((operation) => operation.operationId);

      expect(new Set(ids).size).toBe(19);
      for (const operation of operations) {
        expect(operation.operationId).toEqual(expect.any(String));
        expect(operation.summary).toEqual(expect.any(String));
      }
    });

    it.each(['Ticket', 'Post', 'User', 'TicketStatus', 'TicketList', 'TicketOptions'])(
      'should expose the named schema %s in components.schemas',
      (name) => {
        expect(doc.components?.schemas).toHaveProperty(name);
      },
    );

    it('should reference the named Ticket schema in GET /tickets/{id}', () => {
      const ok = responsesOf(doc.paths!['/tickets/{id}']!.get!)['200']!;

      expect(ok.content?.['application/json']?.schema).toEqual({
        $ref: '#/components/schemas/Ticket',
      });
    });
  });

  describe('security', () => {
    it.each([
      ['/health', 'get'],
      ['/auth/login', 'post'],
    ] as const)('should mark %s as public (security: [])', (path, method) => {
      const operation = doc.paths![path]![method]!;

      expect(operation.security).toEqual([]);
      expect(responsesOf(operation)).not.toHaveProperty('403');
      expect(responsesOf(operation)['200']).not.toHaveProperty('headers');
    });

    it('should document 401/403 and the renewed token header on every protected operation', () => {
      const protectedOps = operationsOf(doc).filter(
        ({ operation }) => !Array.isArray(operation.security) || operation.security.length > 0,
      );

      expect(protectedOps).toHaveLength(17);
      for (const { key, operation } of protectedOps) {
        const responses = responsesOf(operation);
        expect({ key, codes: Object.keys(responses) }).toEqual({
          key,
          codes: expect.arrayContaining(['401', '403', '429', '500']) as unknown,
        });
        const success = Object.entries(responses).filter(([status]) => status.startsWith('2'));
        expect(success.length).toBeGreaterThan(0);
        for (const [, response] of success) {
          expect(response.headers).toHaveProperty('x-access-token');
          expect(response.headers).toHaveProperty('x-access-token-expires-in');
        }
      }
    });

    it('should document 400 on every operation with path params', () => {
      const withParams = operationsOf(doc).filter(({ path }) => path.includes('{'));

      expect(withParams.length).toBeGreaterThan(0);
      for (const { operation } of withParams) {
        expect(responsesOf(operation)).toHaveProperty('400');
      }
    });
  });

  describe('route specific errors', () => {
    it.each([
      ['/tickets', 'post', '422'],
      ['/tickets/{id}', 'get', '404'],
      ['/tickets/{id}', 'patch', '422'],
      ['/tickets/{id}/posts/{postId}', 'delete', '404'],
      ['/users', 'post', '409'],
      ['/auth/login', 'post', '401'],
    ] as const)('should document %s %s with %s', (path, method, status) => {
      const operation = doc.paths![path]![method]!;

      expect(responsesOf(operation)).toHaveProperty(status);
      expect(responsesOf(operation)[status]!.content?.['application/json']?.schema).toMatchObject({
        required: ['statusCode', 'code', 'message'],
      });
    });

    it('should not document 400 nor 401 on /health', () => {
      const responses = responsesOf(doc.paths!['/health']!.get!);

      expect(responses).not.toHaveProperty('400');
      expect(responses).not.toHaveProperty('401');
    });
  });
});

describe('openApiTransform', () => {
  const openapiObject = { openapi: '3.1.0' };

  function transform(method: string | string[], url: string, schema: Record<string, unknown>) {
    return openApiTransform({
      schema,
      url,
      route: { method, url, schema },
      openapiObject,
    } as unknown as Parameters<typeof openApiTransform>[0]);
  }

  it('should throw for a route without operationId mapping', () => {
    expect(() => transform('GET', '/nao-mapeada', { response: { 200: z.object({}) } })).toThrow(
      'Rota sem operationId/summary no OpenAPI: GET /nao-mapeada',
    );
  });

  it.each(['OPTIONS', 'HEAD'])('should hide %s routes even when not mapped', (method) => {
    const result = transform(method, '/qualquer', {});

    expect(result.schema).toMatchObject({ hide: true });
  });

  it('should leave explicitly hidden routes untouched even when not mapped', () => {
    const result = transform('GET', '/interna', { hide: true });

    expect(result.schema).toEqual({ hide: true });
  });

  it('should leave routes without schema untouched', () => {
    const result = openApiTransform({
      schema: undefined,
      url: '/sem-schema',
      route: { method: 'GET', url: '/sem-schema' },
      openapiObject,
    } as unknown as Parameters<typeof openApiTransform>[0]);

    expect(result.schema).toBeUndefined();
  });

  it('should ignore the trailing slash and use the first method when given an array', () => {
    const result = transform(['GET', 'HEAD'], '/tickets/', { querystring: z.strictObject({}) });

    expect(result.schema).toMatchObject({ operationId: 'listTickets' });
  });

  it('should keep a route specific response already defined by the schema', () => {
    const result = transform('POST', '/tickets', {
      body: z.strictObject({}),
      response: { 422: z.object({ custom: z.string() }) },
    });
    const response = (result.schema as { response: Record<string, Record<string, unknown>> })
      .response;

    expect(response['422']).not.toHaveProperty('description', 'Escola não encontrada');
    expect(response).toHaveProperty('400');
  });
});
