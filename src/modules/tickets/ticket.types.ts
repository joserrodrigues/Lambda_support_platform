import type {
  TicketDevStatus,
  TicketEntryType,
  TicketSlaType,
  TicketStatus,
} from './ticket.constants';

/** Representação plana do ticket dentro da aplicação. */
export interface TicketEntity {
  id: string;
  schoolId: number;
  status: TicketStatus;
  devStatus: TicketDevStatus | null;
  entryType: TicketEntryType;
  errorType: string | null;
  supportLevel2: boolean;
  priority: boolean;
  slaType: TicketSlaType | null;
  responseAt: Date | null;
  technicalResponseAt: Date | null;
  schoolResponsible: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTicketData = Omit<TicketEntity, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTicketData = Partial<CreateTicketData>;

export interface TicketFilters {
  schoolId?: number;
  status?: TicketStatus;
  devStatus?: TicketDevStatus;
  entryType?: TicketEntryType;
  slaType?: TicketSlaType;
  priority?: boolean;
  supportLevel2?: boolean;
}

export interface PostAuthor {
  id: string;
  name: string;
}

/** Representação plana do post (comentário) de um ticket. */
export interface PostEntity {
  id: string;
  ticketId: string;
  userId: string | null;
  content: string;
  author: PostAuthor | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePostData {
  ticketId: string;
  userId: string;
  content: string;
}

export interface UpdatePostData {
  content: string;
}

export interface Pagination {
  limit: number;
  offset: number;
}
