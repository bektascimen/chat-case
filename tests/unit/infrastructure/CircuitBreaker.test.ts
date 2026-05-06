import { describe, it, expect } from 'vitest';
import { CircuitBreaker } from '@/infrastructure/ai/CircuitBreaker';

describe('CircuitBreaker', () => {
  function build(opts = { failureThreshold: 3, resetTimeoutMs: 1000 }) {
    let now = 0;
    const breaker = new CircuitBreaker(opts, () => now);
    return {
      breaker,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  it('starts CLOSED and allows requests', () => {
    const { breaker } = build();
    expect(breaker.canPass()).toBe(true);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('trips to OPEN after N consecutive failures', () => {
    const { breaker } = build({ failureThreshold: 3, resetTimeoutMs: 1000 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canPass()).toBe(false);
  });

  it('success resets failure counter while CLOSED', () => {
    const { breaker } = build({ failureThreshold: 3, resetTimeoutMs: 1000 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('transitions OPEN → HALF_OPEN after reset timeout', () => {
    const { breaker, advance } = build({ failureThreshold: 1, resetTimeoutMs: 1000 });
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canPass()).toBe(false);
    advance(1000);
    expect(breaker.canPass()).toBe(true);
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('HALF_OPEN → CLOSED on success', () => {
    const { breaker, advance } = build({ failureThreshold: 1, resetTimeoutMs: 1000 });
    breaker.recordFailure();
    advance(1000);
    breaker.canPass(); // HALF_OPEN
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('HALF_OPEN → OPEN on failure (extends cooldown)', () => {
    const { breaker, advance } = build({ failureThreshold: 1, resetTimeoutMs: 1000 });
    breaker.recordFailure();
    advance(1000);
    breaker.canPass(); // HALF_OPEN
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canPass()).toBe(false);
    advance(999);
    expect(breaker.canPass()).toBe(false);
    advance(1);
    expect(breaker.canPass()).toBe(true);
  });

  it('snapshot reports state and failures', () => {
    const { breaker } = build();
    breaker.recordFailure();
    const snap = breaker.snapshot();
    expect(snap.state).toBe('CLOSED');
    expect(snap.failures).toBe(1);
    expect(snap.nextAttemptAt).toBeNull();
  });
});
