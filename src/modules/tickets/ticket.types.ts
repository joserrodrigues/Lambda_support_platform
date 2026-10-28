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
  title: string | null;
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
  /** Usuário do CMS (`usersWEB`) que criou o chamado. Null se nasceu no Suporte SG. */
  schoolUserId: number | null;
  schoolUserName: string | null;
  /** Null até alguém da equipe abrir o chamado no suporte. */
  viewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTicketData = Omit<TicketEntity, 'id' | 'createdAt' | 'updatedAt' | 'viewedAt'>;
export type UpdateTicketData = Partial<CreateTicketData>;

export interface TicketFilters {
  schoolId?: number;
  status?: TicketStatus;
  devStatus?: TicketDevStatus;
  entryType?: TicketEntryType;
  slaType?: TicketSlaType;
  priority?: boolean;
  supportLevel2?: boolean;
  /** Criado ou alterado a partir deste instante. */
  since?: Date;
}

export interface PostAuthor {
  id: number;
  name: string;
}

/** Representação plana do post (comentário) de um ticket. */
export interface PostEntity {
  id: string;
  ticketId: string;
  userId: number | null;
  content: string;
  /** Nota interna: só o Suporte SG exibe. O FSFWEB ignora estes posts. */
  isInternal: boolean;
  /** Usuário do CMS que enviou a mensagem. Null quando o autor é o suporte. */
  schoolUserId: number | null;
  schoolUserName: string | null;
  author: PostAuthor | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePostData {
  ticketId: string;
  /** Null quando a mensagem veio da escola, do e-mail ou do WhatsApp. */
  userId: number | null;
  content: string;
  isInternal: boolean;
  schoolUserId?: number | null;
  schoolUserName?: string | null;
}

export interface UpdatePostData {
  content: string;
  isInternal?: boolean;
}

export interface Pagination {
  limit: number;
  offset: number;
}
