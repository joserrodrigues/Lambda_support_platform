import { Op } from 'sequelize';
import { activeModels } from '../../database/context';
import { type User } from '../users/user.model';
import { type Post } from './post.model';
import type { CreatePostData, Pagination, PostEntity, UpdatePostData } from './ticket.types';

function postModel(): typeof Post {
  return activeModels().Post;
}

function authorInclude(): {
  model: typeof User;
  as: 'author';
  attributes: ['id', 'name'];
  required: false;
} {
  return {
    model: activeModels().User,
    as: 'author',
    attributes: ['id', 'name'],
    required: false,
  };
}

export interface PostRepository {
  /** Retorna o post somente se ele pertencer ao ticket informado. */
  findInTicket(ticketId: string, postId: string): Promise<PostEntity | null>;
  listByTicket(
    ticketId: string,
    params: Pagination,
  ): Promise<{ rows: PostEntity[]; count: number }>;
  /** Resposta pública da equipe: post não interno com autor do suporte. */
  hasPublicStaffReply(ticketId: string): Promise<boolean>;
  /** Qualquer post, inclusive a mensagem da escola que abriu o chamado. */
  hasAnyPost(ticketId: string): Promise<boolean>;
  /** Primeiro texto público de cada chamado, na ordem de criação. */
  firstPublicContents(ticketIds: string[]): Promise<Map<string, string>>;
  create(data: CreatePostData): Promise<PostEntity>;
  update(ticketId: string, postId: string, data: UpdatePostData): Promise<PostEntity | null>;
  delete(ticketId: string, postId: string): Promise<boolean>;
}

function toEntity(post: Post): PostEntity {
  const author = post.author ?? null;
  return {
    id: post.id,
    ticketId: post.ticketId,
    userId: post.userId ?? null,
    content: post.content,
    isInternal: post.isInternal === true,
    schoolUserId: post.schoolUserId ?? null,
    schoolUserName: post.schoolUserName ?? null,
    author: author ? { id: author.id, name: author.name } : null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export class SequelizePostRepository implements PostRepository {
  private findModel(ticketId: string, postId: string): Promise<Post | null> {
    return postModel().findOne({ where: { id: postId, ticketId }, include: [authorInclude()] });
  }

  async findInTicket(ticketId: string, postId: string): Promise<PostEntity | null> {
    const post = await this.findModel(ticketId, postId);
    return post ? toEntity(post) : null;
  }

  async listByTicket(ticketId: string, { limit, offset }: Pagination) {
    const { rows, count } = await postModel().findAndCountAll({
      where: { ticketId },
      include: [authorInclude()],
      limit,
      offset,
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
      // Evita que o include altere a contagem.
      distinct: true,
    });
    return { rows: rows.map(toEntity), count };
  }

  async hasPublicStaffReply(ticketId: string): Promise<boolean> {
    const found = await postModel().findOne({
      where: { ticketId, isInternal: false, userId: { [Op.ne]: null } },
      attributes: ['id'],
    });
    return found != null;
  }

  async hasAnyPost(ticketId: string): Promise<boolean> {
    const found = await postModel().findOne({
      where: { ticketId },
      attributes: ['id'],
    });
    return found != null;
  }

  async firstPublicContents(ticketIds: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    if (!ticketIds.length) return found;
    const rows = await postModel().findAll({
      where: { ticketId: ticketIds, isInternal: false },
      attributes: ['ticketId', 'content'],
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    for (const row of rows) {
      if (!found.has(row.ticketId)) found.set(row.ticketId, row.content);
    }
    return found;
  }

  async create(data: CreatePostData): Promise<PostEntity> {
    const post = await postModel().create(data);
    // Recarrega com o autor resumido.
    const created = await this.findModel(post.ticketId, post.id);
    return toEntity(created ?? post);
  }

  async update(ticketId: string, postId: string, data: UpdatePostData): Promise<PostEntity | null> {
    const post = await this.findModel(ticketId, postId);
    if (!post) return null;
    const changes: UpdatePostData = { content: data.content };
    if (data.isInternal !== undefined) changes.isInternal = data.isInternal;
    post.set(changes);
    await post.save();
    return toEntity(post);
  }

  async delete(ticketId: string, postId: string): Promise<boolean> {
    const deleted = await postModel().destroy({ where: { id: postId, ticketId } });
    return deleted > 0;
  }
}
