import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { Config } from '@/infrastructure/config/Config';
import { LoggerFactory } from '@/infrastructure/logger/Logger';
import { PrismaClientFactory } from '@/infrastructure/database/PrismaClient';
import { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import { ChatRepository } from '@/repositories/ChatRepository';
import { MessageRepository } from '@/repositories/MessageRepository';
import { FullHistoryStrategy } from '@/strategies/history/FullHistoryStrategy';
import { LimitedHistoryStrategy } from '@/strategies/history/LimitedHistoryStrategy';
import { HistoryStrategySelector } from '@/strategies/history/HistoryStrategySelector';
import { StreamingCompletionStrategy } from '@/strategies/completion/StreamingCompletionStrategy';
import { JsonCompletionStrategy } from '@/strategies/completion/JsonCompletionStrategy';
import { CompletionStrategySelector } from '@/strategies/completion/CompletionStrategySelector';
import { ChatService } from '@/services/ChatService';
import { AiCompletionService } from '@/services/AiCompletionService';
import { ChatController } from '@/controllers/ChatController';
import { CompletionController } from '@/controllers/CompletionController';
import { MockAppCheckVerifier } from '@/middleware/verifiers/MockAppCheckVerifier';
import { JwtAuthVerifier } from '@/middleware/verifiers/JwtAuthVerifier';
import { CircuitBreaker } from '@/infrastructure/ai/CircuitBreaker';
import { CircuitBreakerAiProvider } from '@/infrastructure/ai/providers/CircuitBreakerAiProvider';
import { MockAiProvider } from '@/infrastructure/ai/providers/MockAiProvider';
import type { IAiProvider } from '@/infrastructure/ai/providers/IAiProvider';
import { appCheckMiddleware } from '@/middleware/appCheck';
import { authMiddleware } from '@/middleware/auth';
import { logContextMiddleware } from '@/middleware/logContext';
import { clientTypeMiddleware } from '@/middleware/clientType';
import { registerErrorHandler } from '@/middleware/errorHandler';
import { registerRateLimitPlugin } from '@/middleware/rateLimit';
import { healthRoutes } from '@/routes/health.routes';
import { chatRoutes } from '@/routes/chat.routes';
import { completionRoutes } from '@/routes/completion.routes';
import { adminRoutes } from '@/routes/admin.routes';

/**
 * Builds a Fastify app whose AI provider is the caller-supplied
 * {@link IAiProvider} (wrapped in a real {@link CircuitBreaker}). Mirrors the
 * production composition root but lets integration tests inject a programmable
 * inner provider — needed for end-to-end circuit breaker scenarios where we
 * want to deterministically trip the breaker through real HTTP routes.
 */
export async function buildTestAppWithProvider(opts: {
  innerProvider: IAiProvider;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  fallbackToMock?: boolean;
}): Promise<{
  app: FastifyInstance;
  tokenFor: (sub: string, email: string) => string;
  breaker: CircuitBreaker;
}> {
  Config.resetForTesting();
  LoggerFactory.resetForTesting();
  PrismaClientFactory.resetForTesting();
  FeatureFlagService.resetForTesting();

  const config = Config.getInstance();
  const logger = LoggerFactory.getInstance(config);
  const prisma = PrismaClientFactory.getInstance(config, logger);
  const flags = FeatureFlagService.getInstance(logger);
  const chatRepo = new ChatRepository(prisma);
  const messageRepo = new MessageRepository(prisma);

  const breaker = new CircuitBreaker({
    failureThreshold: opts.failureThreshold ?? 3,
    resetTimeoutMs: opts.resetTimeoutMs ?? 60_000,
  });
  const aiProvider = new CircuitBreakerAiProvider(
    opts.innerProvider,
    breaker,
    logger,
    (opts.fallbackToMock ?? true) ? new MockAiProvider() : null,
  );

  const fullHistory = new FullHistoryStrategy(messageRepo);
  const limitedHistory = new LimitedHistoryStrategy(messageRepo);
  const historySelector = new HistoryStrategySelector(flags, fullHistory, limitedHistory);
  const streaming = new StreamingCompletionStrategy(aiProvider);
  const json = new JsonCompletionStrategy(aiProvider);
  const completionSelector = new CompletionStrategySelector(flags, streaming, json);

  const chatService = new ChatService(chatRepo, historySelector, flags, logger);
  const aiCompletionService = new AiCompletionService(
    chatRepo,
    messageRepo,
    completionSelector,
    flags,
    logger,
  );
  const chatController = new ChatController(chatService);
  const completionController = new CompletionController(aiCompletionService);
  const appCheckVerifier = new MockAppCheckVerifier(config.appCheckToken);
  const authVerifier = new JwtAuthVerifier(config.jwtSecret);

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);
  await registerRateLimitPlugin(app, flags);

  await app.register(async (instance) => {
    await healthRoutes(instance, { prisma, flags, circuitBreaker: breaker });
  });
  await app.register(async (instance) => {
    await adminRoutes(instance, { flags, config });
  });
  await app.register(async (instance) => {
    instance.addHook('onRequest', appCheckMiddleware(appCheckVerifier));
    instance.addHook('onRequest', authMiddleware(authVerifier));
    instance.addHook('onRequest', clientTypeMiddleware);
    instance.addHook('preHandler', logContextMiddleware);
    await chatRoutes(instance, { controller: chatController, flags });
    await completionRoutes(instance, { controller: completionController, flags });
  });

  await app.ready();
  return {
    app,
    tokenFor: (sub, email) => jwt.sign({ sub, email }, config.jwtSecret),
    breaker,
  };
}
