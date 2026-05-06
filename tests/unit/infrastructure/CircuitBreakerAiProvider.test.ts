import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker } from '@/infrastructure/ai/CircuitBreaker';
import {
  CircuitBreakerAiProvider,
  CircuitBreakerOpenError,
} from '@/infrastructure/ai/providers/CircuitBreakerAiProvider';
import type { IAiProvider, AiEvent } from '@/infrastructure/ai/providers/IAiProvider';
import type { Logger } from '@/infrastructure/logger/Logger';

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: () => noopLogger,
} as unknown as Logger;

function fakeProvider(factory: () => AiEvent[] | { error: Error }): IAiProvider {
  return {
    async *stream() {
      const result = factory();
      if ('error' in result) throw result.error;
      for (const e of result) yield e;
    },
  };
}

async function consume(p: IAiProvider): Promise<AiEvent[]> {
  const out: AiEvent[] = [];
  for await (const e of p.stream({ messages: [] })) out.push(e);
  return out;
}

describe('CircuitBreakerAiProvider', () => {
  it('forwards events and records success on done', async () => {
    const inner = fakeProvider(() => [
      { type: 'thinking' },
      { type: 'token', text: 'hi' },
      { type: 'done', finishReason: 'stop' },
    ]);
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    const wrapped = new CircuitBreakerAiProvider(inner, breaker, noopLogger, null);

    const events = await consume(wrapped);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.snapshot().failures).toBe(0);
  });

  it('records failure when inner throws and propagates error', async () => {
    const inner = fakeProvider(() => ({ error: new Error('boom') }));
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    const wrapped = new CircuitBreakerAiProvider(inner, breaker, noopLogger, null);

    await expect(consume(wrapped)).rejects.toThrow('boom');
    expect(breaker.snapshot().failures).toBe(1);
  });

  it('falls back to mock when circuit is OPEN and fallback provided', async () => {
    const failing = fakeProvider(() => ({ error: new Error('down') }));
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
    const fallback = fakeProvider(() => [
      { type: 'token', text: 'fallback' },
      { type: 'done', finishReason: 'stop' },
    ]);
    const wrapped = new CircuitBreakerAiProvider(failing, breaker, noopLogger, fallback);

    // First call fails → trip to OPEN
    await expect(consume(wrapped)).rejects.toThrow();
    expect(breaker.getState()).toBe('OPEN');

    // Second call sees OPEN, uses fallback
    const events = await consume(wrapped);
    expect(events.find((e) => e.type === 'token')).toMatchObject({ text: 'fallback' });
  });

  it('throws CircuitBreakerOpenError when OPEN and no fallback', async () => {
    const failing = fakeProvider(() => ({ error: new Error('down') }));
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
    const wrapped = new CircuitBreakerAiProvider(failing, breaker, noopLogger, null);

    await expect(consume(wrapped)).rejects.toThrow(); // first call's error
    expect(breaker.getState()).toBe('OPEN');

    await expect(consume(wrapped)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });

  it('records failure if stream ends without done event', async () => {
    const inner = fakeProvider(() => [
      { type: 'thinking' },
      { type: 'token', text: 'hi' },
      // no 'done' event
    ]);
    const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 1000 });
    const wrapped = new CircuitBreakerAiProvider(inner, breaker, noopLogger, null);

    const events = await consume(wrapped);
    expect(events).toHaveLength(2);
    expect(breaker.snapshot().failures).toBe(1);
  });
});
