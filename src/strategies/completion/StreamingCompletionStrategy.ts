import type { FastifyReply } from 'fastify';
import type { ICompletionStrategy, CompletionContext, CompletionResult } from './ICompletionStrategy';
import type { IAiProvider } from '@/infrastructure/ai/providers/IAiProvider';

export class StreamingCompletionStrategy implements ICompletionStrategy {
  constructor(private readonly provider: IAiProvider) {}

  async execute(ctx: CompletionContext, reply: FastifyReply): Promise<CompletionResult> {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let assistantContent = '';
    const toolCalls: CompletionResult['toolCalls'] = [];
    let finishReason: CompletionResult['finishReason'] = 'stop';

    try {
      for await (const ev of this.provider.stream({ messages: ctx.messages, tools: ctx.tools })) {
        switch (ev.type) {
          case 'thinking':
            send('thinking', { timestamp: new Date().toISOString() });
            break;
          case 'token':
            assistantContent += ev.text;
            send('token', { text: ev.text });
            break;
          case 'tool_call':
            send('tool_execution', { name: ev.name, args: ev.args });
            toolCalls.push({ name: ev.name, args: ev.args, result: null });
            break;
          case 'tool_result': {
            const last = [...toolCalls].reverse().find((t) => t.name === ev.name && t.result === null);
            if (last) last.result = ev.result;
            send('tool_result', { name: ev.name, result: ev.result });
            break;
          }
          case 'tool_error':
            send('tool_error', { name: ev.name, message: ev.message });
            break;
          case 'done':
            finishReason = ev.finishReason;
            send('done', { finishReason });
            break;
        }
      }
    } catch (err) {
      // Headers already flushed -- we cannot change status. Surface as SSE error event.
      const message = err instanceof Error ? err.message : 'Stream failed';
      send('error', { code: 'STREAM_ERROR', message });
      finishReason = 'stop'; // sanitized
    } finally {
      reply.raw.end();
      // Tell Fastify we have taken over the response so its lifecycle skips
      // serialization / double-send. Without this, Fastify 5 may log a
      // "FST_ERR_REP_ALREADY_SENT" warning when the controller returns.
      reply.hijack();
    }

    return { assistantContent, toolCalls, finishReason };
  }
}
