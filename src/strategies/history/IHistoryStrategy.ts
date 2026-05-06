import type { Message } from '@prisma/client';

export interface IHistoryStrategy {
  fetch(chatId: string): Promise<Message[]>;
}
