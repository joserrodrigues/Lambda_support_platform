import { z } from 'zod';

export const listSchoolsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  /** Trecho de `nomeEscola`. Vazio é tratado como ausência de filtro. */
  name: z.string().trim().max(160).optional(),
});

export const schoolListItemSchema = z
  .strictObject({
    id: z.number().int().positive(),
    name: z.string(),
  })
  .meta({ id: 'School' });

export const schoolListResponseSchema = z
  .strictObject({
    data: z.array(schoolListItemSchema),
    meta: z.strictObject({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .meta({ id: 'SchoolList' });

export type ListSchoolsQuery = z.infer<typeof listSchoolsQuerySchema>;
export type SchoolListItem = z.infer<typeof schoolListItemSchema>;
