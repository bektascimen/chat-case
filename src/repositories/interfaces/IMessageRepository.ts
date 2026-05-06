import type { Message, MessageRole, Prisma } from '@prisma/client';

export interface IMessageRepository {
  findAllByChatId(chatId: string): Promise<Message[]>;
  findRecentByChatId(chatId: string, n: number): Promise<Message[]>;
  create(data: {
    chatId: string;
    role: MessageRole;
    content: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<Message>;
}
