import { z } from 'zod';
import {
  DEFAULT_TICKET_STATUS,
  TICKET_DEV_STATUSES,
  TICKET_ENTRY_TYPES,
  TICKET_SLA_TYPES,
  TICKET_STATUSES,
} from './ticket.constants';

// Validação dos códigos apenas na aplicação (sem ENUM/CHECK no MySQL): ver `ticket.constants.ts`.
const statusSchema = z.enum(TICKET_STATUSES).meta({ id: 'TicketStatus' });
const devStatusSchema = z.enum(TICKET_DEV_STATUSES).meta({ id: 'TicketDevStatus' });
const entryTypeSchema = z.enum(TICKET_ENTRY_TYPES).meta({ id: 'TicketEntryType' });
const slaTypeSchema = z.enum(TICKET_SLA_TYPES).meta({ id: 'TicketSlaType' });

/** `schools.id` é INT UNSIGNED. */
const schoolIdSchema = z.number().int().positive().max(4_294_967_295);
/** ISO 8601 com fuso (`Z` ou `±hh:mm`), convertido para Date. */
const dateTimeSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const errorTypeSchema = z.string().trim().min(1).max(50);
const schoolResponsibleSchema = z.string().trim().min(1).max(120);
const uuidSchema = z.uuid();

// `strictObject` rejeita campos desconhecidos (proteção contra mass assignment - OWASP API3).
export const createTicketBodySchema = z
  .strictObject({
    schoolId: schoolIdSchema,
    status: statusSchema.default(DEFAULT_TICKET_STATUS),
    devStatus: devStatusSchema.nullish(),
    entryType: entryTypeSchema,
    errorType: errorTypeSchema.nullish(),
    supportLevel2: z.boolean().default(false),
    priority: z.boolean().default(false),
    slaType: slaTypeSchema.nullish(),
    responseAt: dateTimeSchema.nullish(),
    technicalResponseAt: dateTimeSchema.nullish(),
    schoolResponsible: schoolResponsibleSchema.nullish(),
  })
  .meta({ id: 'CreateTicketRequest' });

/** Atualização parcial; `null` limpa os campos opcionais. */
export const updateTicketBodySchema = z
  .strictObject({
    schoolId: schoolIdSchema.optional(),
    status: statusSchema.optional(),
    devStatus: devStatusSchema.nullable().optional(),
    entryType: entryTypeSchema.optional(),
    errorType: errorTypeSchema.nullable().optional(),
    supportLevel2: z.boolean().optional(),
    priority: z.boolean().optional(),
    slaType: slaTypeSchema.nullable().optional(),
    responseAt: dateTimeSchema.nullable().optional(),
    technicalResponseAt: dateTimeSchema.nullable().optional(),
    schoolResponsible: schoolResponsibleSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })
  .meta({ id: 'UpdateTicketRequest' });

export const ticketIdParamsSchema = z.strictObject({ id: uuidSchema });
export const postParamsSchema = z.strictObject({ id: uuidSchema, postId: uuidSchema });

const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);
/** Querystring booleana explícita (`z.coerce.boolean` trataria "false" como true). */
const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const listTicketsQuerySchema = z.strictObject({
  page: pageSchema,
  pageSize: pageSizeSchema,
  schoolId: z.coerce.number().int().positive().max(4_294_967_295).optional(),
  status: statusSchema.optional(),
  devStatus: devStatusSchema.optional(),
  entryType: entryTypeSchema.optional(),
  slaType: slaTypeSchema.optional(),
  priority: booleanQuerySchema.optional(),
  supportLevel2: booleanQuerySchema.optional(),
});

export const listPostsQuerySchema = z.strictObject({
  page: pageSchema,
  pageSize: pageSizeSchema,
});

const postContentSchema = z.string().trim().min(1).max(10_000);

export const createPostBodySchema = z
  .strictObject({ content: postContentSchema })
  .meta({ id: 'CreatePostRequest' });
export const updatePostBodySchema = z
  .strictObject({ content: postContentSchema })
  .meta({ id: 'UpdatePostRequest' });

// Schemas de resposta explícitos: somente estes campos são serializados (OWASP API3).
export const publicTicketSchema = z
  .object({
    id: z.uuid(),
    schoolId: z.number().int(),
    status: statusSchema,
    devStatus: devStatusSchema.nullable(),
    entryType: entryTypeSchema,
    errorType: z.string().nullable(),
    supportLevel2: z.boolean(),
    priority: z.boolean(),
    slaType: slaTypeSchema.nullable(),
    responseAt: z.date().nullable(),
    technicalResponseAt: z.date().nullable(),
    schoolResponsible: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Ticket' });

const metaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const ticketListResponseSchema = z
  .object({
    data: z.array(publicTicketSchema),
    meta: metaSchema,
  })
  .meta({ id: 'TicketList' });

export const publicPostSchema = z
  .object({
    id: z.uuid(),
    ticketId: z.uuid(),
    content: z.string(),
    author: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Post' });

export const postListResponseSchema = z
  .object({
    data: z.array(publicPostSchema),
    meta: metaSchema,
  })
  .meta({ id: 'PostList' });

const optionSchema = z.object({ value: z.string(), label: z.string() });

export const ticketOptionsResponseSchema = z
  .object({
    status: z.array(optionSchema),
    devStatus: z.array(optionSchema),
    entryType: z.array(optionSchema),
    slaType: z.array(optionSchema),
  })
  .meta({ id: 'TicketOptions' });

export type CreateTicketBody = z.infer<typeof createTicketBodySchema>;
export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
export type CreatePostBody = z.infer<typeof createPostBodySchema>;
export type UpdatePostBody = z.infer<typeof updatePostBodySchema>;
export type PublicTicket = z.infer<typeof publicTicketSchema>;
export type PublicPost = z.infer<typeof publicPostSchema>;
export type TicketOptionsResponse = z.infer<typeof ticketOptionsResponseSchema>;
