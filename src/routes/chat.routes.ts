import type { FastifyInstance } from 'fastify';
import type { ChatController } from '@/controllers/ChatController';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import { listChatsQuerySchema, chatIdParamsSchema } from '@/schemas/chat.schema';
import { buildRateLimitOptions } from '@/middleware/rateLimit';

type Deps = { controller: ChatController; flags: FeatureFlagService };

export async function chatRoutes(app: FastifyInstance, deps: Deps) {
  app.get(
    '/api/chats',
    {
      schema: { querystring: listChatsQuerySchema },
      config: {
        rateLimit: buildRateLimitOptions(deps.flags),
      },
    },
    deps.controller.list,
  );

  app.get(
    '/api/chats/:chatId/history',
    {
      schema: { params: chatIdParamsSchema },
      config: {
        rateLimit: buildRateLimitOptions(deps.flags),
      },
    },
    deps.controller.history,
  );
}
