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
import { buildContainer } from '@/container';
import { appCheckMiddleware } from '@/middleware/appCheck';
import { authMiddleware } from '@/middleware/auth';
import { logContextMiddleware } from '@/middleware/logContext';
import { clientTypeMiddleware } from '@/middleware/clientType';
import { registerErrorHandler } from '@/middleware/errorHandler';
import { registerRateLimitPlugin } from '@/middleware/rateLimit';
import { chatRoutes } from '@/routes/chat.routes';
import { completionRoutes } from '@/routes/completion.routes';
import { adminRoutes } from '@/routes/admin.routes';

export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  tokenFor: (sub: string, email: string) => string;
}> {
  // Reset all singletons so a fresh DATABASE_URL is picked up
  Config.resetForTesting();
  LoggerFactory.resetForTesting();
  PrismaClientFactory.resetForTesting();
  FeatureFlagService.resetForTesting();

  const c = buildContainer();
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await registerRateLimitPlugin(app, c.flags);

  // Register error handler BEFORE routes so encapsulated plugins inherit it.
  registerErrorHandler(app);

  await app.register(async (instance) => {
    await adminRoutes(instance, { flags: c.flags, config: c.config });
  });

  await app.register(async (instance) => {
    instance.addHook('onRequest', appCheckMiddleware(c.appCheckVerifier));
    instance.addHook('onRequest', authMiddleware(c.authVerifier));
    instance.addHook('onRequest', clientTypeMiddleware);
    instance.addHook('preHandler', logContextMiddleware);
    await chatRoutes(instance, { controller: c.chatController, flags: c.flags });
    await completionRoutes(instance, {
      controller: c.completionController,
      flags: c.flags,
    });
  });

  await app.ready();
  return {
    app,
    tokenFor: (sub, email) => jwt.sign({ sub, email }, c.config.jwtSecret),
  };
}

export async function seedFixture(
  prismaUrl: string,
): Promise<{ aliceId: string; chatId: string }> {
  process.env.DATABASE_URL = prismaUrl;
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient({ datasources: { db: { url: prismaUrl } } });

  await p.message.deleteMany();
  await p.chat.deleteMany();
  await p.user.deleteMany();

  const alice = await p.user.create({
    data: { email: 'alice@test.com', name: 'Alice' },
  });
  const chat = await p.chat.create({
    data: { userId: alice.id, title: 'Test chat' },
  });
  await p.message.createMany({
    data: [
      { chatId: chat.id, role: 'USER', content: 'Hello' },
      { chatId: chat.id, role: 'ASSISTANT', content: 'Hi back' },
    ],
  });
  await p.$disconnect();
  return { aliceId: alice.id, chatId: chat.id };
}
