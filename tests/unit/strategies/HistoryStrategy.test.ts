import { describe, it, expect, vi } from 'vitest';
import { FullHistoryStrategy } from '@/strategies/history/FullHistoryStrategy';
import { LimitedHistoryStrategy } from '@/strategies/history/LimitedHistoryStrategy';
import { HistoryStrategySelector } from '@/strategies/history/HistoryStrategySelector';
import type { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';

const fakeRepo = (): IMessageRepository => ({
  findAllByChatId: vi.fn().mockResolvedValue([{ id: 'all' } as never]),
  findRecentByChatId: vi.fn().mockResolvedValue([{ id: 'recent' } as never]),
  create: vi.fn(),
});

describe('HistoryStrategy', () => {
  it('FullHistoryStrategy uses findAllByChatId', async () => {
    const repo = fakeRepo();
    const s = new FullHistoryStrategy(repo);
    const r = await s.fetch('chat-1');
    expect(repo.findAllByChatId).toHaveBeenCalledWith('chat-1');
    expect(r).toEqual([{ id: 'all' }]);
  });

  it('LimitedHistoryStrategy uses findRecentByChatId with last-10', async () => {
    const repo = fakeRepo();
    const s = new LimitedHistoryStrategy(repo);
    const r = await s.fetch('chat-1');
    expect(repo.findRecentByChatId).toHaveBeenCalledWith('chat-1', 10);
    expect(r).toEqual([{ id: 'recent' }]);
  });

  it('Selector picks Full when CHAT_HISTORY_ENABLED=true', () => {
    const flags = { isEnabled: vi.fn().mockReturnValue(true) } as unknown as FeatureFlagService;
    const full = {} as FullHistoryStrategy;
    const limited = {} as LimitedHistoryStrategy;
    const sel = new HistoryStrategySelector(flags, full, limited);
    expect(sel.select()).toBe(full);
  });

  it('Selector picks Limited when CHAT_HISTORY_ENABLED=false', () => {
    const flags = { isEnabled: vi.fn().mockReturnValue(false) } as unknown as FeatureFlagService;
    const full = {} as FullHistoryStrategy;
    const limited = {} as LimitedHistoryStrategy;
    const sel = new HistoryStrategySelector(flags, full, limited);
    expect(sel.select()).toBe(limited);
  });
});
