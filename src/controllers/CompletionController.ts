import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IAiCompletionService } from '@/services/interfaces/IAiCompletionService';
import type { ChatIdParams } from '@/schemas/chat.schema';
import type { CompletionBody } from '@/schemas/completion.schema';
import { UnauthorizedError } from '@/errors/UnauthorizedError';

export class CompletionController {
  constructor(private readonly service: IAiCompletionService) {}

  handle = async (
    req: FastifyRequest<{ Params: ChatIdParams; Body: CompletionBody }>,
    reply: FastifyReply,
  ) => {
    if (!req.user) throw new UnauthorizedError('No authenticated user');
    await this.service.complete(
      { chatId: req.params.chatId, userId: req.user.id, prompt: req.body.prompt },
      reply,
    );
    // Strategy is responsible for reply.send / reply.raw.end()
  };
}
