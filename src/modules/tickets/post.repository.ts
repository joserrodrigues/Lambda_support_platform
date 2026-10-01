import { User } from '../users/user.model';
import { Post } from './post.model';
import type { CreatePostData, Pagination, PostEntity, UpdatePostData } from './ticket.types';

export interface PostRepository {
  /** Retorna o post somente se ele pertencer ao ticket informado. */
  findInTicket(ticketId: string, postId: string): Promise<PostEntity | null>;
  listByTicket(
    ticketId: string,
    params: Pagination,
  ): Promise<{ rows: PostEntity[]; count: number }>;
  create(data: CreatePostData): Promise<PostEntity>;
  update(ticketId: string, postId: string, data: UpdatePostData): Promise<PostEntity | null>;
  delete(ticketId: string, postId: string): Promise<boolean>;
}

// Apenas id e nome do autor (nunca e-mail, papel ou hash). `paranoid: false` mantém o nome de
// autores excluídos logicamente no histórico do ticket.
const authorInclude = {
  model: User,
  as: 'author',
  attributes: ['id', 'name'],
  required: false,
  paranoid: false,
};

function toEntity(post: Post): PostEntity {
  const author = post.author ?? null;
  return {
    id: post.id,
    ticketId: post.ticketId,
    userId: post.userId ?? null,
    content: post.content,
    author: author ? { id: author.id, name: author.name } : null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export class SequelizePostRepository implements PostRepository {
  private findModel(ticketId: string, postId: string): Promise<Post | null> {
    return Post.findOne({ where: { id: postId, ticketId }, include: [authorInclude] });
  }

  async findInTicket(ticketId: string, postId: string): Promise<PostEntity | null> {
    const post = await this.findModel(ticketId, postId);
    return post ? toEntity(post) : null;
  }

  async listByTicket(ticketId: string, { limit, offset }: Pagination) {
    const { rows, count } = await Post.findAndCountAll({
      where: { ticketId },
      include: [authorInclude],
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

  async create(data: CreatePostData): Promise<PostEntity> {
    const post = await Post.create(data);
    // Recarrega com o autor resumido.
    const created = await this.findModel(post.ticketId, post.id);
    return toEntity(created ?? post);
  }

  async update(ticketId: string, postId: string, data: UpdatePostData): Promise<PostEntity | null> {
    const post = await this.findModel(ticketId, postId);
    if (!post) return null;
    post.set({ content: data.content });
    await post.save();
    return toEntity(post);
  }

  async delete(ticketId: string, postId: string): Promise<boolean> {
    const deleted = await Post.destroy({ where: { id: postId, ticketId } });
    return deleted > 0;
  }
}
