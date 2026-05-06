import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { CompletionController } from '@/controllers/CompletionController';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import { chatIdParamsSchema } from '@/schemas/chat.schema';
import { completionBodySchema } from '@/schemas/completion.schema';
import { buildRateLimitOptions } from '@/middleware/rateLimit';
import { requireFeatureFlag } from '@/middleware/featureFlag';

type Deps = { controller: CompletionController; flags: FeatureFlagService };

export async function completionRoutes(app: FastifyInstance, deps: Deps) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/chats/:chatId/completion',
    {
      schema: { params: chatIdParamsSchema, body: completionBodySchema },
      config: {
        rateLimit: buildRateLimitOptions(deps.flags),
      },
      preHandler: requireFeatureFlag(deps.flags, 'COMPLETION_ENABLED'),
    },
    deps.controller.handle,
  );
}
