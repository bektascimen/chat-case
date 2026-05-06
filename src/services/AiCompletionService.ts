import type { FastifyReply } from 'fastify';
import { MessageRole, type Prisma } from '@prisma/client';
import type { IChatRepository } from '@/repositories/interfaces/IChatRepository';
import type { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import type { CompletionStrategySelector } from '@/strategies/completion/CompletionStrategySelector';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { Logger } from '@/infrastructure/logger/Logger';
import type { AiMessage } from '@/infrastructure/ai/providers/IAiProvider';
import { toolRegistry } from '@/infrastructure/ai/tools';
import { NotFoundError } from '@/errors/NotFoundError';
import type {
  IAiCompletionService,
  CompletionRequestContext,
} from './interfaces/IAiCompletionService';

export class AiCompletionService implements IAiCompletionService {
  constructor(
    private readonly chatRepo: IChatRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly completionSelector: CompletionStrategySelector,
    private readonly flags: FeatureFlagService,
    private readonly logger: Logger,
  ) {}

  async complete(ctx: CompletionRequestContext, reply: FastifyReply): Promise<void> {
    const chat = await this.chatRepo.findById(ctx.chatId, ctx.userId);
    if (!chat) throw new NotFoundError('Chat not found', { chatId: ctx.chatId });

    // Persist user message first
    await this.messageRepo.create({
      chatId: ctx.chatId,
      role: MessageRole.USER,
      content: ctx.prompt,
    });

    // Reload prior history (user message included) for context
    const prior = await this.messageRepo.findAllByChatId(ctx.chatId);
    const messages: AiMessage[] = prior.map((m) => ({
      role: m.role === 'ASSISTANT' ? 'assistant' : m.role === 'SYSTEM' ? 'system' : 'user',
      content: m.content,
    }));

    const tools = this.flags.isEnabled('AI_TOOLS_ENABLED') ? toolRegistry.all() : [];
    const strategy = this.completionSelector.select();

    this.logger.debug(
      { chatId: ctx.chatId, strategy: strategy.constructor.name, toolsCount: tools.length },
      'completion starting',
    );

    const result = await strategy.execute(
      { chatId: ctx.chatId, userId: ctx.userId, messages, tools, prompt: ctx.prompt },
      reply,
    );

    // Persist assistant reply with metadata if tool calls present
    const metadata: Prisma.InputJsonValue | undefined =
      result.toolCalls.length > 0
        ? ({
            toolCalls: result.toolCalls,
            finishReason: result.finishReason,
          } as unknown as Prisma.InputJsonValue)
        : undefined;

    await this.messageRepo.create({
      chatId: ctx.chatId,
      role: MessageRole.ASSISTANT,
      content: result.assistantContent,
      metadata,
    });
  }
}
