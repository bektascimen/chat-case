import type { Message } from '@prisma/client';
import type { IHistoryStrategy } from './IHistoryStrategy';
import type { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';

export class LimitedHistoryStrategy implements IHistoryStrategy {
  static readonly LAST_N = 10;
  constructor(private readonly repo: IMessageRepository) {}

  async fetch(chatId: string): Promise<Message[]> {
    return this.repo.findRecentByChatId(chatId, LimitedHistoryStrategy.LAST_N);
  }
}
