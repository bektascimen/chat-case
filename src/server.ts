import Fastify, { type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

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
import { healthRoutes } from '@/routes/health.routes';
import { PrismaClientFactory } from '@/infrastructure/database/PrismaClient';
import { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';

async function bootstrap() {
  const c = buildContainer();
  c.logger.info({ env: c.config.env, port: c.config.port }, 'starting server');

  // Cast: Pino 10's Logger satisfies FastifyBaseLogger structurally, but TS
  // narrows the FastifyInstance generic to Pino's Logger which then conflicts
  // with default-typed plugins (cors, swagger, etc.). Casting keeps the app
  // generic on FastifyBaseLogger.
  const app = Fastify({
    loggerInstance: c.logger as unknown as FastifyBaseLogger,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Error handler MUST be registered before route plugins — Fastify 5 only
  // propagates setErrorHandler to plugins registered later in the same scope.
  // Encapsulated route plugins registered before this would seal Fastify's
  // default error shape and bypass our consistent JSON envelope.
  registerErrorHandler(app);

  // Helmet first, so its security headers apply to every response (including
  // 4xx/5xx envelopes from later plugins). CSP is intentionally disabled
  // because @fastify/swagger-ui ships inline scripts/styles for /docs; for a
  // JSON API backend CSP is primarily meaningful on HTML responses, so the
  // safe trade-off is to skip it rather than carve exceptions.
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, { origin: true });
  await registerRateLimitPlugin(app, c.flags);

  // Swagger — `jsonSchemaTransform` converts our Zod route schemas into the
  // JSON Schema format that @fastify/swagger reads. Without it, parameters
  // and bodies render as "Could not render Parameters" in /docs.
  await app.register(swagger, {
    openapi: {
      info: { title: 'AppNation Chat API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          appCheck: { type: 'apiKey', in: 'header', name: 'X-Firebase-AppCheck' },
          adminToken: { type: 'apiKey', in: 'header', name: 'X-Admin-Token' },
        },
      },
      security: [{ bearerAuth: [], appCheck: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Public/admin routes (no auth)
  await app.register(async (instance) => {
    await adminRoutes(instance, { flags: c.flags, config: c.config });
  });

  // Health probes (no auth — Kubernetes liveness/readiness can't carry JWTs)
  await app.register(async (instance) => {
    await healthRoutes(instance, {
      prisma: c.prisma,
      flags: c.flags,
      circuitBreaker: c.circuitBreaker,
    });
  });

  // Authenticated routes
  await app.register(async (instance) => {
    instance.addHook('onRequest', appCheckMiddleware(c.appCheckVerifier));
    instance.addHook('onRequest', authMiddleware(c.authVerifier));
    instance.addHook('onRequest', clientTypeMiddleware);
    // logContextMiddleware runs as preHandler so req.user / req.clientType are
    // already set when we enrich the child logger. Fastify's default request
    // logger still emits the first-line "incoming request" log with requestId
    // (via Pino), so no information is lost on the auth/appCheck path.
    instance.addHook('preHandler', logContextMiddleware);

    await chatRoutes(instance, { controller: c.chatController, flags: c.flags });
    await completionRoutes(instance, { controller: c.completionController, flags: c.flags });
  });

  const shutdown = async (signal: string) => {
    c.logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await PrismaClientFactory.disconnect();
      FeatureFlagService.resetForTesting();
      c.logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      c.logger.error({ err }, 'shutdown error');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: c.config.port, host: '0.0.0.0' });
  c.logger.info(
    {
      url: `http://0.0.0.0:${c.config.port}`,
      docs: `http://0.0.0.0:${c.config.port}/docs`,
    },
    'server ready',
  );
}

bootstrap().catch((err) => {
  // The Pino logger may have failed to initialize at this point (e.g., bad
  // config); fall back to console.error so the cause is at least visible
  // before the process exits.
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
