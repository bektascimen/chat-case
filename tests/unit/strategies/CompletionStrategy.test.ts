import { describe, it, expect, vi } from 'vitest';
import { JsonCompletionStrategy } from '@/strategies/completion/JsonCompletionStrategy';
import { StreamingCompletionStrategy } from '@/strategies/completion/StreamingCompletionStrategy';
import { CompletionStrategySelector } from '@/strategies/completion/CompletionStrategySelector';
import type { IAiProvider, AiEvent } from '@/infrastructure/ai/providers/IAiProvider';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';

function fakeProvider(events: AiEvent[]): IAiProvider {
  return {
    async *stream() {
      for (const e of events) yield e;
    },
  };
}

function fakeReply() {
  const sent: unknown[] = [];
  const writes: string[] = [];
  return {
    sent,
    writes,
    send: vi.fn((body: unknown) => {
      sent.push(body);
      return Promise.resolve();
    }) as unknown as () => Promise<void>,
    hijack: vi.fn(),
    raw: {
      writeHead: vi.fn(),
      write: vi.fn((s: string) => {
        writes.push(s);
        return true;
      }),
      end: vi.fn(),
    },
  };
}

describe('JsonCompletionStrategy', () => {
  it('aggregates tokens into a single response payload', async () => {
    const provider = fakeProvider([
      { type: 'thinking' },
      { type: 'token', text: 'Hello ' },
      { type: 'token', text: 'world' },
      { type: 'done', finishReason: 'stop' },
    ]);
    const reply = fakeReply();
    const s = new JsonCompletionStrategy(provider);
    const result = await s.execute(
      { chatId: 'c', userId: 'u', messages: [], tools: [], prompt: 'x' },
      reply as never,
    );
    expect(result.assistantContent).toBe('Hello world');
    expect(reply.sent[0]).toMatchObject({ message: 'Hello world', finishReason: 'stop' });
  });
});

describe('StreamingCompletionStrategy', () => {
  it('writes SSE event lines', async () => {
    const provider = fakeProvider([
      { type: 'thinking' },
      { type: 'token', text: 'Hi' },
      { type: 'done', finishReason: 'stop' },
    ]);
    const reply = fakeReply();
    const s = new StreamingCompletionStrategy(provider);
    await s.execute(
      { chatId: 'c', userId: 'u', messages: [], tools: [], prompt: 'x' },
      reply as never,
    );
    const joined = reply.writes.join('');
    expect(joined).toContain('event: thinking');
    expect(joined).toContain('event: token');
    expect(joined).toContain('event: done');
    expect(reply.raw.end).toHaveBeenCalled();
  });
});

describe('StreamingCompletionStrategy — tool calls', () => {
  it('emits tool_execution and tool_result SSE events and tracks them in result', async () => {
    const provider = fakeProvider([
      { type: 'thinking' },
      { type: 'tool_call', name: 'getCurrentWeather', args: { city: 'Berlin' } },
      { type: 'tool_result', name: 'getCurrentWeather', result: { tempC: 20, condition: 'sunny' } },
      { type: 'token', text: 'It is 20C in Berlin.' },
      { type: 'done', finishReason: 'tool_calls' },
    ]);
    const reply = fakeReply();
    const s = new StreamingCompletionStrategy(provider);
    const result = await s.execute(
      { chatId: 'c', userId: 'u', messages: [], tools: [], prompt: 'weather?' },
      reply as never,
    );

    const joined = reply.writes.join('');
    expect(joined).toContain('event: tool_execution');
    expect(joined).toContain('"name":"getCurrentWeather"');
    expect(joined).toContain('"city":"Berlin"');
    expect(joined).toContain('event: tool_result');
    expect(joined).toContain('"tempC":20');

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'getCurrentWeather',
      args: { city: 'Berlin' },
      result: { tempC: 20, condition: 'sunny' },
    });
    expect(result.finishReason).toBe('tool_calls');
  });

  it('emits tool_error SSE event when provider yields tool_error', async () => {
    const provider = fakeProvider([
      { type: 'tool_error', name: 'getCurrentWeather', message: 'API rate limit exceeded' },
      { type: 'done', finishReason: 'stop' },
    ]);
    const reply = fakeReply();
    const s = new StreamingCompletionStrategy(provider);
    await s.execute(
      { chatId: 'c', userId: 'u', messages: [], tools: [], prompt: 'x' },
      reply as never,
    );
    const joined = reply.writes.join('');
    expect(joined).toContain('event: tool_error');
    expect(joined).toContain('rate limit');
  });

  it('emits SSE error event when provider stream throws', async () => {
    const provider: IAiProvider = {
      async *stream() {
        yield { type: 'token', text: 'partial ' } as AiEvent;
        throw new Error('upstream blew up');
      },
    };
    const reply = fakeReply();
    const s = new StreamingCompletionStrategy(provider);
    const result = await s.execute(
      { chatId: 'c', userId: 'u', messages: [], tools: [], prompt: 'x' },
      reply as never,
    );
    const joined = reply.writes.join('');
    expect(joined).toContain('event: error');
    expect(joined).toContain('STREAM_ERROR');
    expect(joined).toContain('upstream blew up');
    expect(result.finishReason).toBe('stop');
    expect(reply.raw.end).toHaveBeenCalled();
    expect(reply.hijack).toHaveBeenCalled();
  });
});

describe('JsonCompletionStrategy — tool calls', () => {
  it('aggregates tool calls and results into the final JSON', async () => {
    const provider = fakeProvider([
      { type: 'tool_call', name: 'getCurrentWeather', args: { city: 'Tokyo' } },
      { type: 'tool_result', name: 'getCurrentWeather', result: { tempC: 18 } },
      { type: 'token', text: 'Tokyo is 18C.' },
      { type: 'done', finishReason: 'tool_calls' },
    ]);
    const reply = fakeReply();
    const s = new JsonCompletionStrategy(provider);
    const result = await s.execute(
      { chatId: 'c', userId: 'u', messages: [], tools: [], prompt: 'weather' },
      reply as never,
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'getCurrentWeather',
      args: { city: 'Tokyo' },
      result: { tempC: 18 },
    });
    expect(result.assistantContent).toContain('Tokyo');
    expect(result.finishReason).toBe('tool_calls');
    expect(reply.sent[0]).toMatchObject({
      message: 'Tokyo is 18C.',
      toolCalls: expect.arrayContaining([expect.objectContaining({ name: 'getCurrentWeather' })]),
      finishReason: 'tool_calls',
    });
  });
});

describe('CompletionStrategySelector', () => {
  it('selects streaming when flag true', () => {
    const flags = { isEnabled: vi.fn().mockReturnValue(true) } as unknown as FeatureFlagService;
    const streaming = {} as StreamingCompletionStrategy;
    const json = {} as JsonCompletionStrategy;
    expect(new CompletionStrategySelector(flags, streaming, json).select()).toBe(streaming);
  });
  it('selects json when flag false', () => {
    const flags = { isEnabled: vi.fn().mockReturnValue(false) } as unknown as FeatureFlagService;
    const streaming = {} as StreamingCompletionStrategy;
    const json = {} as JsonCompletionStrategy;
    expect(new CompletionStrategySelector(flags, streaming, json).select()).toBe(json);
  });
});
