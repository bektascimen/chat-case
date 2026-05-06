import type { Chat, Message } from '@prisma/client';
import type { IChatRepository, PagedResult } from '@/repositories/interfaces/IChatRepository';
import type { HistoryStrategySelector } from '@/strategies/history/HistoryStrategySelector';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { Logger } from '@/infrastructure/logger/Logger';
import { NotFoundError } from '@/errors/NotFoundError';
import type { IChatService } from './interfaces/IChatService';

export class ChatService implements IChatService {
  constructor(
    private readonly chatRepo: IChatRepository,
    private readonly historySelector: HistoryStrategySelector,
    private readonly flags: FeatureFlagService,
    private readonly logger: Logger,
  ) {}

  async listChats(userId: string, cursor?: string): Promise<PagedResult<Chat>> {
    const limit = this.flags.getNumber('PAGINATION_LIMIT');
    const result = await this.chatRepo.list(userId, { cursor, limit });
    this.logger.debug({ userId, returned: result.data.length, limit, hasMore: result.pagination.hasMore }, 'chats listed');
    return result;
  }

  async getHistory(chatId: string, userId: string): Promise<Message[]> {
    const chat = await this.chatRepo.findById(chatId, userId);
    if (!chat) throw new NotFoundError('Chat not found', { chatId });
    const strategy = this.historySelector.select();
    const messages = await strategy.fetch(chatId);
    this.logger.debug({ chatId, returned: messages.length, strategy: strategy.constructor.name }, 'history fetched');
    return messages;
  }
}
