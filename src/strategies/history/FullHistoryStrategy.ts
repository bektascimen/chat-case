import type { Message } from '@prisma/client';
import type { IHistoryStrategy } from './IHistoryStrategy';
import type { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';

export class FullHistoryStrategy implements IHistoryStrategy {
  constructor(private readonly repo: IMessageRepository) {}

  async fetch(chatId: string): Promise<Message[]> {
    return this.repo.findAllByChatId(chatId);
  }
}
