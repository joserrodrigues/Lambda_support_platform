import { z } from 'zod';
import { AI_PROVIDERS } from './ai.types';

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(255)
  .refine((value) => {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  }, 'A URL precisa ser https, ou http só em localhost');

const aiOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const aiStatusSchema = z
  .object({ options: z.array(aiOptionSchema) })
  .meta({ id: 'AiStatus' });

export const aiConfigSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    provider: z.enum(AI_PROVIDERS),
    baseUrl: z.string(),
    model: z.string(),
    hasKey: z.boolean(),
    keyHint: z.string(),
    secretName: z.string(),
  })
  .meta({ id: 'AiConfig' });

export const aiConfigListSchema = z
  .object({ items: z.array(aiConfigSchema) })
  .meta({ id: 'AiConfigList' });

export const aiConfigBodySchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    provider: z.enum(AI_PROVIDERS),
    baseUrl: httpsUrl,
    model: z.string().trim().min(1).max(120),
    secretName: z
      .string()
      .trim()
      .max(512)
      .regex(/^[A-Za-z0-9/_+=.@-]*$/, 'O nome do segredo só pode ter letras, números e /_+=.@-')
      .optional(),
  })
  .meta({ id: 'AiConfigBody' });

export const aiIdParamsSchema = z
  .object({
    id: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  })
  .meta({ id: 'AiIdParams' });

export const improveBodySchema = z
  .strictObject({
    text: z.string().trim().min(1).max(10_000),
    aiId: z.string().trim().min(1).max(32),
  })
  .meta({ id: 'ImproveTextRequest' });

export const improveResponseSchema = z
  .object({ text: z.string() })
  .meta({ id: 'ImproveTextResponse' });

export type AiConfigBody = z.infer<typeof aiConfigBodySchema>;
