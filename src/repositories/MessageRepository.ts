import type { Message, MessageRole, Prisma, PrismaClient } from '@prisma/client';
import { Prisma as PrismaNS } from '@prisma/client';
import type { IMessageRepository } from './interfaces/IMessageRepository';

export class MessageRepository implements IMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllByChatId(chatId: string): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findRecentByChatId(chatId: string, n: number): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: n,
    });
    return rows.reverse(); // chronological for the caller
  }

  async create(data: {
    chatId: string;
    role: MessageRole;
    content: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<Message> {
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId: data.chatId,
          role: data.role,
          content: data.content,
          metadata: data.metadata ?? PrismaNS.JsonNull,
        },
      }),
      this.prisma.chat.update({
        where: { id: data.chatId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }
}
