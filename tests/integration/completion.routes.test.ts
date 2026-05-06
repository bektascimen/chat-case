import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, stopTestDb } from './helpers/testDb';
import { buildTestApp, seedFixture } from './helpers/testApp';
import type { FastifyInstance } from 'fastify';

const APPCHECK = 'mock-app-check-token';

describe('Completion routes (integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let chatId: string;
  let aliceId: string;
  let dbUrl: string;

  beforeAll(async () => {
    dbUrl = await startTestDb();
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-1234567890';
    process.env.APP_CHECK_TOKEN = APPCHECK;
    process.env.ADMIN_TOKEN = 'admin';
    process.env.AI_PROVIDER = 'mock';
    const fixture = await seedFixture(dbUrl);
    aliceId = fixture.aliceId;
    chatId = fixture.chatId;
    const built = await buildTestApp();
    app = built.app;
    token = built.tokenFor(aliceId, 'alice@test.com');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await stopTestDb();
  });

  it('POST completion with STREAMING_ENABLED=true returns SSE event stream', async () => {
    process.env.STREAMING_ENABLED = 'true';
    await app.inject({
      method: 'POST', url: '/admin/flags/reload',
      headers: { 'x-admin-token': 'admin' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/completion`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-firebase-appcheck': APPCHECK,
        'content-type': 'application/json',
      },
      payload: { prompt: 'Hello' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/event-stream/);
    expect(res.body).toContain('event: thinking');
    expect(res.body).toContain('event: token');
    expect(res.body).toContain('event: done');
  });

  it('POST completion with STREAMING_ENABLED=false returns JSON', async () => {
    process.env.STREAMING_ENABLED = 'false';
    await app.inject({
      method: 'POST', url: '/admin/flags/reload',
      headers: { 'x-admin-token': 'admin' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/completion`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-firebase-appcheck': APPCHECK,
        'content-type': 'application/json',
      },
      payload: { prompt: 'Hello' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.json();
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('finishReason');
    delete process.env.STREAMING_ENABLED;
  });

  it('POST with empty prompt returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/completion`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-firebase-appcheck': APPCHECK,
        'content-type': 'application/json',
      },
      payload: { prompt: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
