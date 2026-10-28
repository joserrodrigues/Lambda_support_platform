import { isMissingTicketTableError, TICKET_TABLES_MISSING } from '../../../src/shared/ticket-tables';

describe('isMissingTicketTableError', () => {
  it('should recognize a missing fsfadm_tickets table', () => {
    const error = {
      original: {
        code: 'ER_NO_SUCH_TABLE',
        errno: 1146,
        sqlMessage: "Table 'BaseEscolas.fsfadm_tickets' doesn't exist",
      },
    };

    expect(isMissingTicketTableError(error)).toBe(true);
    expect(TICKET_TABLES_MISSING).toBe(
      'Tabelas de ticket não existem por favor contate o suporte.',
    );
  });

  it('should recognize a missing fsfadm_posts table on the parent error', () => {
    const error = {
      parent: {
        errno: 1146,
        sqlMessage: "Table 'BaseEscolas.fsfadm_posts' doesn't exist",
      },
    };

    expect(isMissingTicketTableError(error)).toBe(true);
  });

  it('should ignore a missing table that is not a ticket table', () => {
    const error = {
      original: {
        code: 'ER_NO_SUCH_TABLE',
        sqlMessage: "Table 'BaseEscolas.fsfadm_Escolas' doesn't exist",
      },
    };

    expect(isMissingTicketTableError(error)).toBe(false);
  });
});
