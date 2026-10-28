export const TICKET_TABLES_MISSING =
  'Tabelas de ticket não existem por favor contate o suporte.';

interface DbErrorPart {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

function partsOf(error: unknown): DbErrorPart[] {
  if (!error || typeof error !== 'object') return [];
  const record = error as Record<string, unknown>;
  const parts: DbErrorPart[] = [];
  const push = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    parts.push({
      code: typeof item.code === 'string' ? item.code : undefined,
      errno: typeof item.errno === 'number' ? item.errno : undefined,
      sqlMessage:
        typeof item.sqlMessage === 'string'
          ? item.sqlMessage
          : typeof item.message === 'string'
            ? item.message
            : undefined,
    });
  };
  push(record);
  push(record.original);
  push(record.parent);
  push(record.cause);
  return parts;
}

/** MySQL 1146 em `fsfadm_tickets` ou `fsfadm_posts` (a migration do Suporte SG ainda não rodou). */
export function isMissingTicketTableError(error: unknown): boolean {
  return partsOf(error).some((part) => {
    const missingTable = part.code === 'ER_NO_SUCH_TABLE' || part.errno === 1146;
    if (!missingTable) return false;
    const sql = part.sqlMessage ?? '';
    return sql.includes('fsfadm_tickets') || sql.includes('fsfadm_posts');
  });
}
