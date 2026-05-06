import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IChatService } from '@/services/interfaces/IChatService';
import { UnauthorizedError } from '@/errors/UnauthorizedError';
import type { ListChatsQuery, ChatIdParams } from '@/schemas/chat.schema';

export class ChatController {
  constructor(private readonly chatService: IChatService) {}

  list = async (req: FastifyRequest<{ Querystring: ListChatsQuery }>, reply: FastifyReply) => {
    if (!req.user) throw new UnauthorizedError('No authenticated user');
    const result = await this.chatService.listChats(req.user.id, req.query.cursor);
    return reply.send(result);
  };

  history = async (req: FastifyRequest<{ Params: ChatIdParams }>, reply: FastifyReply) => {
    if (!req.user) throw new UnauthorizedError('No authenticated user');
    const messages = await this.chatService.getHistory(req.params.chatId, req.user.id);
    return reply.send({ data: messages });
  };
}
