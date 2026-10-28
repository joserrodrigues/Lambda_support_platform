import { z } from 'zod';
import {
  TICKET_DEV_STATUSES,
  TICKET_ENTRY_TYPES,
  TICKET_SLA_TYPES,
  TICKET_STATUSES,
} from '../tickets/ticket.constants';

const dateTimeSchema = z.iso.datetime({ offset: true });

/** Campos do chamado mais o texto de abertura. `date` e `hash` autenticam e não entram na ficha. */
export const inboundTicketSchema = z
  .object({
    schoolId: z.number().int().positive().max(4_294_967_295),
    title: z.string().trim().min(1).max(191).nullish(),
    entryType: z.enum(TICKET_ENTRY_TYPES),
    content: z.string().trim().min(1).max(10_000),
    status: z.enum(TICKET_STATUSES).optional(),
    devStatus: z.enum(TICKET_DEV_STATUSES).nullish(),
    errorType: z.string().trim().min(1).max(50).nullish(),
    supportLevel2: z.boolean().optional(),
    priority: z.boolean().optional(),
    slaType: z.enum(TICKET_SLA_TYPES).nullish(),
    responseAt: dateTimeSchema.nullish(),
    technicalResponseAt: dateTimeSchema.nullish(),
    schoolResponsible: z.string().trim().min(1).max(120).nullish(),
    schoolUserId: z.number().int().positive().max(4_294_967_295).nullish(),
    schoolUserName: z.string().trim().min(1).max(191).nullish(),
  })
  .meta({ id: 'InboundTicketRequest' });

export type InboundTicketBody = z.infer<typeof inboundTicketSchema>;

export const inboundSearchSchema = z
  .object({
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
    schoolId: z.number().int().positive().max(4_294_967_295).optional(),
    status: z.enum(TICKET_STATUSES).optional(),
    devStatus: z.enum(TICKET_DEV_STATUSES).optional(),
    entryType: z.enum(TICKET_ENTRY_TYPES).optional(),
    slaType: z.enum(TICKET_SLA_TYPES).optional(),
    priority: z.boolean().optional(),
    supportLevel2: z.boolean().optional(),
    since: z.iso.datetime({ offset: true }).optional(),
  })
  .meta({ id: 'InboundTicketSearch' });

export type InboundSearchBody = z.infer<typeof inboundSearchSchema>;

export const inboundImproveSchema = z
  .object({
    text: z.string().trim().min(1).max(10_000),
    aiId: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/).optional(),
    ticketId: z.string().trim().min(1).max(64).optional(),
  })
  .meta({ id: 'InboundImproveText' });

export type InboundImproveBody = z.infer<typeof inboundImproveSchema>;
