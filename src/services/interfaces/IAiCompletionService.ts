import type { FastifyReply } from 'fastify';

export type CompletionRequestContext = { chatId: string; userId: string; prompt: string };

export interface IAiCompletionService {
  complete(ctx: CompletionRequestContext, reply: FastifyReply): Promise<void>;
}
