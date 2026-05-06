import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiCompletionService } from '@/services/AiCompletionService';
import { NotFoundError } from '@/errors/NotFoundError';
import type { IChatRepository } from '@/repositories/interfaces/IChatRepository';
import type { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import type { CompletionStrategySelector } from '@/strategies/completion/CompletionStrategySelector';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { Logger } from '@/infrastructure/logger/Logger';

const noopLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLogger } as unknown as Logger;

describe('AiCompletionService', () => {
  let chatRepo: IChatRepository;
  let messageRepo: IMessageRepository;
  let selector: CompletionStrategySelector;
  let flags: FeatureFlagService;

  beforeEach(() => {
    chatRepo = { list: vi.fn(), findById: vi.fn(), create: vi.fn() };
    messageRepo = {
      create: vi.fn().mockResolvedValue({ id: 'm', chatId: 'c', role: 'USER', content: 'x', createdAt: new Date(), metadata: null }),
      findAllByChatId: vi.fn().mockResolvedValue([]),
      findRecentByChatId: vi.fn(),
    };
    selector = {
      select: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({ assistantContent: 'reply', toolCalls: [], finishReason: 'stop' }),
      }),
    } as unknown as CompletionStrategySelector;
    flags = { isEnabled: vi.fn().mockReturnValue(false), getNumber: vi.fn() } as unknown as FeatureFlagService;
  });

  it('throws NotFoundError when chat not owned by user', async () => {
    (chatRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const svc = new AiCompletionService(chatRepo, messageRepo, selector, flags, noopLogger);
    await expect(
      svc.complete({ chatId: 'x', userId: 'u', prompt: 'hi' }, {} as never),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('persists user + assistant messages', async () => {
    (chatRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c' });
    const svc = new AiCompletionService(chatRepo, messageRepo, selector, flags, noopLogger);
    await svc.complete({ chatId: 'c', userId: 'u', prompt: 'hi' }, {} as never);
    expect(messageRepo.create).toHaveBeenCalledTimes(2);
    const calls = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[0]).toMatchObject({ role: 'USER', content: 'hi' });
    expect(calls[1]?.[0]).toMatchObject({ role: 'ASSISTANT', content: 'reply' });
  });

  it('passes tools when AI_TOOLS_ENABLED=true', async () => {
    (chatRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c' });
    (flags.isEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const svc = new AiCompletionService(chatRepo, messageRepo, selector, flags, noopLogger);
    await svc.complete({ chatId: 'c', userId: 'u', prompt: 'hi' }, {} as never);
    const stratExec = (selector.select() as { execute: ReturnType<typeof vi.fn> }).execute;
    expect(stratExec).toHaveBeenCalled();
    const callArg = stratExec.mock.calls[0]?.[0];
    expect(callArg.tools.length).toBeGreaterThan(0);
  });
});
