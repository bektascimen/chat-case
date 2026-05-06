import { describe, it, expect, vi } from 'vitest';
import { RetryAiProvider } from '@/infrastructure/ai/providers/RetryAiProvider';
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

const noSleep = async () => {};
const noJitter = () => 0.5; // returns 0 contribution: (0.5*2 - 1) = 0

async function consume(p: IAiProvider): Promise<AiEvent[]> {
  const out: AiEvent[] = [];
  for await (const e of p.stream({ messages: [] })) out.push(e);
  return out;
}

describe('RetryAiProvider', () => {
  it('passes through on first success — no retry', async () => {
    const inner: IAiProvider = {
      async *stream() {
        yield { type: 'token', text: 'hi' };
        yield { type: 'done', finishReason: 'stop' };
      },
    };
    const wrapped = new RetryAiProvider(
      inner,
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, jitterRatio: 0 },
      noopLogger,
      noSleep,
      noJitter,
    );
    const events = await consume(wrapped);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('retries on pre-stream failure and succeeds', async () => {
    let calls = 0;
    const inner: IAiProvider = {
      async *stream() {
        calls += 1;
        if (calls < 2) throw new Error('transient');
        yield { type: 'done', finishReason: 'stop' };
      },
    };
    const wrapped = new RetryAiProvider(
      inner,
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, jitterRatio: 0 },
      noopLogger,
      noSleep,
      noJitter,
    );
    const events = await consume(wrapped);
    expect(calls).toBe(2);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('exhausts retries and throws', async () => {
    let calls = 0;
    const inner: IAiProvider = {
      async *stream() {
        calls += 1;
        throw new Error('always fails');
      },
    };
    const wrapped = new RetryAiProvider(
      inner,
      { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, jitterRatio: 0 },
      noopLogger,
      noSleep,
      noJitter,
    );
    await expect(consume(wrapped)).rejects.toThrow('always fails');
    expect(calls).toBe(3);
  });

  it('does NOT retry once events have been yielded (mid-stream failure)', async () => {
    let calls = 0;
    const inner: IAiProvider = {
      async *stream() {
        calls += 1;
        yield { type: 'token', text: 'partial' };
        throw new Error('mid-stream failure');
      },
    };
    const wrapped = new RetryAiProvider(
      inner,
      { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100, jitterRatio: 0 },
      noopLogger,
      noSleep,
      noJitter,
    );
    await expect(consume(wrapped)).rejects.toThrow('mid-stream failure');
    expect(calls).toBe(1); // no retry attempted
  });

  it('exponential backoff with jitter', async () => {
    const sleeps: number[] = [];
    const fakeSleep = async (ms: number) => {
      sleeps.push(ms);
    };
    let calls = 0;
    const inner: IAiProvider = {
      async *stream() {
        calls += 1;
        if (calls < 4) throw new Error('fail');
        yield { type: 'done', finishReason: 'stop' };
      },
    };
    const wrapped = new RetryAiProvider(
      inner,
      { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 1000, jitterRatio: 0 },
      noopLogger,
      fakeSleep,
      noJitter,
    );
    await consume(wrapped);
    // Attempts: 1 fail, 2 fail, 3 fail, 4 success → 3 sleeps
    expect(sleeps).toEqual([100, 200, 400]); // 100 * 2^0, 2^1, 2^2
  });
});
