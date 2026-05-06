import type { FastifyReply } from 'fastify';
import type { AiMessage, ToolDef } from '@/infrastructure/ai/providers/IAiProvider';

export type CompletionContext = {
  chatId: string;
  userId: string;
  messages: AiMessage[];
  tools: ToolDef[];
  prompt: string;
};

export type CompletionResult = {
  assistantContent: string;
  toolCalls: { name: string; args: unknown; result: unknown }[];
  finishReason: 'stop' | 'length' | 'tool_calls';
};

export interface ICompletionStrategy {
  execute(ctx: CompletionContext, reply: FastifyReply): Promise<CompletionResult>;
}
