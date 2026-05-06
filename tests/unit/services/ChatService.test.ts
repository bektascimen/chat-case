import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '@/services/ChatService';
import { NotFoundError } from '@/errors/NotFoundError';
import type { IChatRepository } from '@/repositories/interfaces/IChatRepository';
import type { HistoryStrategySelector } from '@/strategies/history/HistoryStrategySelector';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { Logger } from '@/infrastructure/logger/Logger';

const noopLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLogger } as unknown as Logger;

describe('ChatService', () => {
  let chatRepo: IChatRepository;
  let selector: HistoryStrategySelector;
  let flags: FeatureFlagService;

  beforeEach(() => {
    chatRepo = {
      list: vi.fn().mockResolvedValue({ data: [], pagination: { limit: 25, nextCursor: null, hasMore: false } }),
      findById: vi.fn(),
      create: vi.fn(),
    };
    selector = { select: vi.fn().mockReturnValue({ fetch: vi.fn().mockResolvedValue([{ id: 'm1' }]) }) } as unknown as HistoryStrategySelector;
    flags = { getNumber: vi.fn().mockReturnValue(25), isEnabled: vi.fn() } as unknown as FeatureFlagService;
  });

  it('passes PAGINATION_LIMIT to repo', async () => {
    const svc = new ChatService(chatRepo, selector, flags, noopLogger);
    await svc.listChats('user-1');
    expect(flags.getNumber).toHaveBeenCalledWith('PAGINATION_LIMIT');
    expect(chatRepo.list).toHaveBeenCalledWith('user-1', { cursor: undefined, limit: 25 });
  });

  it('throws NotFoundError when chat does not belong to user', async () => {
    (chatRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = new ChatService(chatRepo, selector, flags, noopLogger);
    await expect(svc.getHistory('chat-x', 'user-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('uses selected history strategy', async () => {
    (chatRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'chat-1' });
    const svc = new ChatService(chatRepo, selector, flags, noopLogger);
    const r = await svc.getHistory('chat-1', 'user-1');
    expect(selector.select).toHaveBeenCalled();
    expect(r).toEqual([{ id: 'm1' }]);
  });
});
