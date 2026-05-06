import { z } from 'zod';

export const listChatsQuerySchema = z.object({
  cursor: z.string().optional(),
});
export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>;

export const chatIdParamsSchema = z.object({
  chatId: z.uuid('chatId must be a UUID'),
});
export type ChatIdParams = z.infer<typeof chatIdParamsSchema>;
