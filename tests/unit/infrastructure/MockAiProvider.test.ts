import { describe, it, expect } from 'vitest';
import { MockAiProvider } from '@/infrastructure/ai/providers/MockAiProvider';
import type { AiEvent } from '@/infrastructure/ai/providers/IAiProvider';

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('MockAiProvider', () => {
  it('emits thinking → tokens → done sequence without tools', async () => {
    const provider = new MockAiProvider({ tokenDelayMs: 0 });
    const events = await collect<AiEvent>(
      provider.stream({ messages: [{ role: 'user', content: 'hi' }] }),
    );
    expect(events[0]).toEqual({ type: 'thinking' });
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('emits tool_call and tool_result when tools provided', async () => {
    const provider = new MockAiProvider({ tokenDelayMs: 0 });
    const tools = [
      {
        name: 'getCurrentWeather',
        description: 'weather',
        parameters: { type: 'object' } as never,
        execute: async () => ({ tempC: 20 }),
      },
    ];
    const events = await collect<AiEvent>(
      provider.stream({ messages: [{ role: 'user', content: 'weather?' }], tools: tools as never }),
    );
    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
  });
});
