import type { FastifyReply } from 'fastify';
import type { ICompletionStrategy, CompletionContext, CompletionResult } from './ICompletionStrategy';
import type { IAiProvider } from '@/infrastructure/ai/providers/IAiProvider';

export class JsonCompletionStrategy implements ICompletionStrategy {
  constructor(private readonly provider: IAiProvider) {}

  async execute(ctx: CompletionContext, reply: FastifyReply): Promise<CompletionResult> {
    let assistantContent = '';
    const toolCalls: CompletionResult['toolCalls'] = [];
    let finishReason: CompletionResult['finishReason'] = 'stop';

    for await (const ev of this.provider.stream({ messages: ctx.messages, tools: ctx.tools })) {
      switch (ev.type) {
        case 'token':
          assistantContent += ev.text;
          break;
        case 'tool_call':
          toolCalls.push({ name: ev.name, args: ev.args, result: null });
          break;
        case 'tool_result': {
          const last = [...toolCalls].reverse().find((t) => t.name === ev.name && t.result === null);
          if (last) last.result = ev.result;
          break;
        }
        case 'tool_error':
          // Surface tool failures as a synthetic tool-call entry with the
          // error captured in `result.error` so the assistant payload still
          // documents what was attempted.
          toolCalls.push({ name: ev.name, args: null, result: { error: ev.message } });
          break;
        case 'done':
          finishReason = ev.finishReason;
          break;
        // 'thinking' ignored in JSON mode
      }
    }

    await reply.send({ message: assistantContent, toolCalls, finishReason });
    return { assistantContent, toolCalls, finishReason };
  }
}
