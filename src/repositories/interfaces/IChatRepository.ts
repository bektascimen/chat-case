import type { Chat } from '@prisma/client';

export type PagedResult<T> = {
  data: T[];
  pagination: { limit: number; nextCursor: string | null; hasMore: boolean };
};

export interface IChatRepository {
  list(userId: string, opts: { cursor?: string; limit: number }): Promise<PagedResult<Chat>>;
  findById(chatId: string, userId: string): Promise<Chat | null>;
  create(data: { userId: string; title: string }): Promise<Chat>;
}
