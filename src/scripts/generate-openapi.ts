/* eslint-disable no-console */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { OpenAPIV3_1 } from 'openapi-types';
import { buildApp } from '../app';
import { loadConfig } from '../config/env';

/**
 * Gera docs/openapi.json e docs/openapi.yaml a partir dos schemas das rotas.
 * Não conecta ao banco: as rotas são apenas registradas, nunca executadas.
 */
function stripDateTimePatterns(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripDateTimePatterns);
  if (node && typeof node === 'object') {
    const entries = Object.entries(node as Record<string, unknown>);
    const isDateTime = entries.some(([key, value]) => key === 'format' && value === 'date-time');
    return Object.fromEntries(
      entries
        .filter(([key]) => !(isDateTime && key === 'pattern'))
        .map(([key, value]) => [key, stripDateTimePatterns(value)]),
    );
  }
  return node;
}

type OpenApiDocument = OpenAPIV3_1.Document;

/** Remove componentes não referenciados (o Zod gera variantes de entrada e saída de cada schema). */
function pruneUnusedSchemas(document: OpenApiDocument): OpenApiDocument {
  const schemas = (document.components?.schemas ?? {}) as Record<string, unknown>;
  const used = new Set<string>();
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === '$ref' && typeof value === 'string') {
          const name = value.replace('#/components/schemas/', '');
          if (!used.has(name)) {
            used.add(name);
            collect(schemas[name]);
          }
        } else {
          collect(value);
        }
      }
    }
  };
  collect(document.paths);
  const kept = Object.fromEntries(Object.entries(schemas).filter(([name]) => used.has(name)));
  return { ...document, components: { ...document.components, schemas: kept } } as OpenApiDocument;
}

/**
 * O Zod gera `XInput` para schemas usados como entrada. Renomeia para `X` quando não há
 * conflito, ou reaproveita `X` quando os dois são idênticos (ex.: enums).
 */
function mergeInputSchemas(document: OpenApiDocument): OpenApiDocument {
  const original = new Map(Object.entries(document.components?.schemas ?? {}));
  const schemas = new Map(original);
  const renames = new Map<string, string>();
  for (const [name, schema] of original) {
    if (!name.endsWith('Input')) continue;
    const base = name.slice(0, -'Input'.length);
    const existing = schemas.get(base);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(schema)) continue;
    schemas.set(base, schema);
    schemas.delete(name);
    renames.set(`#/components/schemas/${name}`, `#/components/schemas/${base}`);
  }
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([key, value]) => [
          key,
          key === '$ref' && typeof value === 'string'
            ? (renames.get(value) ?? value)
            : rewrite(value),
        ]),
      );
    }
    return node;
  };
  return rewrite({
    ...document,
    components: { ...document.components, schemas: Object.fromEntries(schemas) },
  }) as OpenApiDocument;
}

async function run(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_SECRET: process.env.JWT_SECRET ?? 'openapi-generation-only-secret-000000',
  });
  const app = await buildApp({
    config,
    logger: false,
    openapi: {
      servers: [
        { url: 'http://127.0.0.1:3000', description: 'Local (npm run dev)' },
        {
          url: 'https://{apiId}.execute-api.{region}.amazonaws.com/{stage}',
          description: 'AWS API Gateway',
          variables: {
            apiId: { default: 'api-id' },
            region: { default: 'us-east-1' },
            stage: { default: 'dev', enum: ['dev', 'staging', 'prod'] },
          },
        },
      ],
    },
  });
  await app.ready();

  // Remove o regex gigante que o Zod gera para date-time (o `format` já descreve o campo).
  // prune → merge → prune: descarta variantes não usadas antes de unificar os nomes.
  const raw = stripDateTimePatterns(app.swagger()) as OpenApiDocument;
  const document = pruneUnusedSchemas(mergeInputSchemas(pruneUnusedSchemas(raw)));

  const outDir = path.resolve(__dirname, '../../docs');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`);
  await writeFile(path.join(outDir, 'openapi.yaml'), stringifyYaml(document));
  await app.close();
  console.log(`OpenAPI gerado em ${path.relative(process.cwd(), outDir)}/openapi.{json,yaml}`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
