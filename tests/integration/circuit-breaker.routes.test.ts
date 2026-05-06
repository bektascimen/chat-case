import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, stopTestDb } from './helpers/testDb';
import { seedFixture } from './helpers/testApp';
import { buildTestAppWithProvider } from './helpers/testAppWithProvider';
import type { FastifyInstance } from 'fastify';
import type { IAiProvider, AiEvent } from '@/infrastructure/ai/providers/IAiProvider';
import type { CircuitBreaker } from '@/infrastructure/ai/CircuitBreaker';

const APPCHECK = 'mock-app-check-token';

/** Inner provider that fails on demand, then yields a normal stream. */
function makeFailingProvider(failuresBeforeSuccess: number): IAiProvider {
  let calls = 0;
  return {
    async *stream() {
      calls += 1;
      if (calls <= failuresBeforeSuccess) {
        throw new Error(`simulated failure ${calls}`);
      }
      yield { type: 'token', text: 'recovered' } satisfies AiEvent;
      yield { type: 'done', finishReason: 'stop' } satisfies AiEvent;
    },
  };
}

describe('Circuit breaker (integration)', () => {
  let app: FastifyInstance;
  let breaker: CircuitBreaker;
  let token: string;
  let chatId: string;

  beforeAll(async () => {
    const dbUrl = await startTestDb();
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-1234567890';
    process.env.APP_CHECK_TOKEN = APPCHECK;
    process.env.ADMIN_TOKEN = 'admin';
    process.env.AI_PROVIDER = 'mock';
    process.env.STREAMING_ENABLED = 'false'; // JSON makes assertions easier

    const fixture = await seedFixture(dbUrl);
    chatId = fixture.chatId;

    const built = await buildTestAppWithProvider({
      innerProvider: makeFailingProvider(100), // never recovers; we want to trip
      failureThreshold: 3,
      resetTimeoutMs: 60_000,
      fallbackToMock: true,
    });
    app = built.app;
    breaker = built.breaker;
    token = built.tokenFor(fixture.aliceId, 'alice@test.com');
  }, 120_000);

  afterAll(async () => {
    delete process.env.STREAMING_ENABLED;
    await app.close();
    await stopTestDb();
  });

  it('trips the circuit after threshold failures and falls back to mock', async () => {
    const headers = {
      authorization: `Bearer ${token}`,
      'x-firebase-appcheck': APPCHECK,
      'content-type': 'application/json',
    };
    const payload = { prompt: 'test' };

    // First N=3 calls fail (inner provider throws → 5xx)
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/chats/${chatId}/completion`,
        headers,
        payload,
      });
      expect(res.statusCode).toBe(500);
    }
    expect(breaker.getState()).toBe('OPEN');

    // 4th call: breaker is OPEN, falls back to MockAiProvider → 200
    const fallbackRes = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/completion`,
      headers,
      payload,
    });
    expect(fallbackRes.statusCode).toBe(200);
    expect(fallbackRes.headers['content-type']).toMatch(/application\/json/);
    const body = fallbackRes.json();
    // Mock returns the scripted message; just assert it's non-empty
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('GET /health/ready reflects breaker state as down when open', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.llmCircuitBreaker.status).toBe('down');
    expect(body.checks.llmCircuitBreaker.detail.state).toBe('OPEN');
  });

  it('GET /health/live always returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
