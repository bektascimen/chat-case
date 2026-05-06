import { Config } from '@/infrastructure/config/Config';
import { LoggerFactory, type Logger } from '@/infrastructure/logger/Logger';
import { PrismaClientFactory, type PrismaClient } from '@/infrastructure/database/PrismaClient';
import { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';

import { ChatRepository } from '@/repositories/ChatRepository';
import { MessageRepository } from '@/repositories/MessageRepository';
import type { IChatRepository } from '@/repositories/interfaces/IChatRepository';
import type { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';

import { FullHistoryStrategy } from '@/strategies/history/FullHistoryStrategy';
import { LimitedHistoryStrategy } from '@/strategies/history/LimitedHistoryStrategy';
import { HistoryStrategySelector } from '@/strategies/history/HistoryStrategySelector';

import { StreamingCompletionStrategy } from '@/strategies/completion/StreamingCompletionStrategy';
import { JsonCompletionStrategy } from '@/strategies/completion/JsonCompletionStrategy';
import { CompletionStrategySelector } from '@/strategies/completion/CompletionStrategySelector';

import { MockAiProvider } from '@/infrastructure/ai/providers/MockAiProvider';
import { OpenAiProvider } from '@/infrastructure/ai/providers/OpenAiProvider';
import { GeminiProvider } from '@/infrastructure/ai/providers/GeminiProvider';
import { CircuitBreaker } from '@/infrastructure/ai/CircuitBreaker';
import { CircuitBreakerAiProvider } from '@/infrastructure/ai/providers/CircuitBreakerAiProvider';
import { RetryAiProvider } from '@/infrastructure/ai/providers/RetryAiProvider';
import type { IAiProvider } from '@/infrastructure/ai/providers/IAiProvider';

import { ChatService } from '@/services/ChatService';
import { AiCompletionService } from '@/services/AiCompletionService';

import { ChatController } from '@/controllers/ChatController';
import { CompletionController } from '@/controllers/CompletionController';

import { MockAppCheckVerifier } from '@/middleware/verifiers/MockAppCheckVerifier';
import { JwtAuthVerifier } from '@/middleware/verifiers/JwtAuthVerifier';
import type { IAppCheckVerifier } from '@/middleware/verifiers/IAppCheckVerifier';
import type { IAuthVerifier } from '@/middleware/verifiers/IAuthVerifier';

export interface AppContainer {
  config: Config;
  logger: Logger;
  prisma: PrismaClient;
  flags: FeatureFlagService;
  chatRepo: IChatRepository;
  messageRepo: IMessageRepository;
  aiProvider: IAiProvider;
  /** Live breaker reference for /health/ready introspection — null with Mock. */
  circuitBreaker: CircuitBreaker | null;
  chatService: ChatService;
  aiCompletionService: AiCompletionService;
  chatController: ChatController;
  completionController: CompletionController;
  appCheckVerifier: IAppCheckVerifier;
  authVerifier: IAuthVerifier;
}

export function buildContainer(): AppContainer {
  // 1. Singletons
  const config = Config.getInstance();
  const logger = LoggerFactory.getInstance(config);
  const prisma = PrismaClientFactory.getInstance(config, logger);
  const flags = FeatureFlagService.getInstance(logger);
  flags.startWatching();

  // 2. Repositories
  const chatRepo = new ChatRepository(prisma);
  const messageRepo = new MessageRepository(prisma);

  // 3. AI provider chain: Provider -> Retry -> CircuitBreaker -> consumer
  // Retry sits INSIDE the breaker so transient blips never count toward the
  // breaker's failure tally — only post-retry (sustained) failures do.
  let baseAiProvider: IAiProvider;
  let usesRealProvider = false;
  if (config.aiProvider === 'openai' && config.openaiApiKey) {
    baseAiProvider = new OpenAiProvider(
      config.openaiApiKey,
      logger,
      config.llmRequestTimeoutMs,
    );
    usesRealProvider = true;
  } else if (config.aiProvider === 'gemini' && config.geminiApiKey) {
    baseAiProvider = new GeminiProvider(
      config.geminiApiKey,
      logger,
      config.llmRequestTimeoutMs,
    );
    usesRealProvider = true;
  } else {
    baseAiProvider = new MockAiProvider();
  }

  let circuitBreaker: CircuitBreaker | null = null;
  let aiProvider: IAiProvider;
  if (usesRealProvider) {
    const retryProvider = new RetryAiProvider(
      baseAiProvider,
      {
        maxAttempts: config.llmRetryMaxAttempts,
        baseDelayMs: config.llmRetryBaseDelayMs,
        maxDelayMs: config.llmRetryMaxDelayMs,
        jitterRatio: config.llmRetryJitterRatio,
      },
      logger,
    );
    circuitBreaker = new CircuitBreaker({
      failureThreshold: config.llmCircuitFailureThreshold,
      resetTimeoutMs: config.llmCircuitResetTimeoutMs,
    });
    aiProvider = new CircuitBreakerAiProvider(
      retryProvider,
      circuitBreaker,
      logger,
      config.llmCircuitFallback === 'mock' ? new MockAiProvider() : null,
    );
  } else {
    aiProvider = baseAiProvider;
  }

  // 4. Strategies (history)
  const fullHistory = new FullHistoryStrategy(messageRepo);
  const limitedHistory = new LimitedHistoryStrategy(messageRepo);
  const historySelector = new HistoryStrategySelector(flags, fullHistory, limitedHistory);

  // 5. Strategies (completion)
  const streamingStrategy = new StreamingCompletionStrategy(aiProvider);
  const jsonStrategy = new JsonCompletionStrategy(aiProvider);
  const completionSelector = new CompletionStrategySelector(flags, streamingStrategy, jsonStrategy);

  // 6. Services
  const chatService = new ChatService(chatRepo, historySelector, flags, logger);
  const aiCompletionService = new AiCompletionService(
    chatRepo,
    messageRepo,
    completionSelector,
    flags,
    logger,
  );

  // 7. Controllers
  const chatController = new ChatController(chatService);
  const completionController = new CompletionController(aiCompletionService);

  // 8. Verifiers
  const appCheckVerifier = new MockAppCheckVerifier(config.appCheckToken);
  const authVerifier = new JwtAuthVerifier(config.jwtSecret);

  return {
    config,
    logger,
    prisma,
    flags,
    chatRepo,
    messageRepo,
    aiProvider,
    circuitBreaker,
    chatService,
    aiCompletionService,
    chatController,
    completionController,
    appCheckVerifier,
    authVerifier,
  };
}
