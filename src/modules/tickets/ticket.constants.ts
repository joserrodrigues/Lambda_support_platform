/**
 * Valores permitidos para os campos categóricos do ticket.
 *
 * O banco armazena apenas o CÓDIGO (VARCHAR) e a API devolve o código; o rótulo é exibido pelo
 * frontend (via `GET /tickets/options`). A validação é feita SOMENTE na aplicação (Zod `z.enum`),
 * sem ENUM nem CHECK no MySQL, para que novos valores possam ser adicionados sem migration.
 * Ao remover um valor, migre antes os registros que o utilizam (a resposta da API valida o enum).
 */

export const TICKET_STATUSES = [
  'aguardando',
  'em_analise',
  'aguardando_suporte_n2',
  'resposta_n2_realizada',
  'done',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const DEFAULT_TICKET_STATUS: TicketStatus = 'aguardando';

export const TICKET_STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  aguardando: 'Aguardando',
  em_analise: 'Em análise',
  aguardando_suporte_n2: 'Aguardando suporte N2',
  resposta_n2_realizada: 'Resposta N2 realizada',
  done: 'Done',
};

export const TICKET_DEV_STATUSES = [
  'aguardando',
  'em_analise',
  'em_desenvolvimento',
  'em_teste',
  'aguardando_cliente',
  'aguardando_importacao',
  'aguardando_producao',
  'aguardando_loja',
  'proxima_sprint',
  'nao_necessita_desenvolvimento',
  'concluido',
] as const;
export type TicketDevStatus = (typeof TICKET_DEV_STATUSES)[number];

export const TICKET_DEV_STATUS_LABELS: Readonly<Record<TicketDevStatus, string>> = {
  aguardando: 'Aguardando',
  em_analise: 'Em análise',
  em_desenvolvimento: 'Em desenvolvimento',
  em_teste: 'Em teste',
  aguardando_cliente: 'Aguardando cliente',
  aguardando_importacao: 'Aguardando importação',
  aguardando_producao: 'Aguardando produção',
  aguardando_loja: 'Aguardando loja',
  proxima_sprint: 'Próxima sprint',
  nao_necessita_desenvolvimento: 'Não necessita desenvolvimento',
  concluido: 'Concluído',
};

export const TICKET_ENTRY_TYPES = ['email', 'cms', 'reuniao', 'whatsapp'] as const;
export type TicketEntryType = (typeof TICKET_ENTRY_TYPES)[number];

export const TICKET_ENTRY_TYPE_LABELS: Readonly<Record<TicketEntryType, string>> = {
  email: 'E-mail',
  cms: 'CMS',
  reuniao: 'Reunião',
  whatsapp: 'WhatsApp',
};

export const TICKET_SLA_TYPES = ['critico', 'alto', 'medio', 'baixo'] as const;
export type TicketSlaType = (typeof TICKET_SLA_TYPES)[number];

export const TICKET_SLA_TYPE_LABELS: Readonly<Record<TicketSlaType, string>> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Médio',
  baixo: 'Baixo',
};

export interface TicketOption<T extends string> {
  value: T;
  label: string;
}

/** Converte a lista de códigos em pares {value, label}, preservando a ordem definida acima. */
export function toOptions<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
): TicketOption<T>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
