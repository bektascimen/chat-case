import type { Chat, PrismaClient } from '@prisma/client';
import type { IChatRepository, PagedResult } from './interfaces/IChatRepository';

export class ChatRepository implements IChatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    userId: string,
    { cursor, limit }: { cursor?: string; limit: number },
  ): Promise<PagedResult<Chat>> {
    const decoded = cursor ? this.decodeCursor(cursor) : null;

    const rows = await this.prisma.chat.findMany({
      where: {
        userId,
        ...(decoded
          ? {
              OR: [
                { updatedAt: { lt: decoded.updatedAt } },
                { updatedAt: decoded.updatedAt, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? this.encodeCursor(last.updatedAt, last.id) : null;

    return { data, pagination: { limit, nextCursor, hasMore } };
  }

  async findById(chatId: string, userId: string): Promise<Chat | null> {
    return this.prisma.chat.findFirst({ where: { id: chatId, userId } });
  }

  async create(data: { userId: string; title: string }): Promise<Chat> {
    return this.prisma.chat.create({ data });
  }

  private encodeCursor(updatedAt: Date, id: string): string {
    return Buffer.from(`${updatedAt.toISOString()}|${id}`, 'utf8').toString('base64url');
  }

  private decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
    try {
      const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (!iso || !id) return null;
      const updatedAt = new Date(iso);
      if (isNaN(updatedAt.getTime())) return null;
      return { updatedAt, id };
    } catch {
      return null;
    }
  }
}
