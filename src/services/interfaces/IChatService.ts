import type { Chat, Message } from '@prisma/client';
import type { PagedResult } from '@/repositories/interfaces/IChatRepository';

export interface IChatService {
  listChats(userId: string, cursor?: string): Promise<PagedResult<Chat>>;
  getHistory(chatId: string, userId: string): Promise<Message[]>;
}
