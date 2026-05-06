import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startTestDb, stopTestDb } from './helpers/testDb';
import { buildTestApp, seedFixture } from './helpers/testApp';

const APPCHECK = 'mock-app-check-token';

describe('Chat routes (integration)', () => {
  let app: FastifyInstance;
  let token: string;
  let dbUrl: string;
  let aliceId: string;
  let chatId: string;

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

  it('GET /api/chats returns paginated list for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/chats',
      headers: { authorization: `Bearer ${token}`, 'x-firebase-appcheck': APPCHECK },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({ limit: 20, hasMore: false });
  });

  it('GET /api/chats returns 401 without auth header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/chats',
      headers: { 'x-firebase-appcheck': APPCHECK },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/chats returns 403 without app check header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/chats',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('GET /api/chats/:chatId/history returns messages', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/chats/${chatId}/history`,
      headers: { authorization: `Bearer ${token}`, 'x-firebase-appcheck': APPCHECK },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it('GET history with CHAT_HISTORY_ENABLED=false returns last-N (limited)', async () => {
    // Bulk-insert >10 messages, then toggle flag, expect 10
    process.env.CHAT_HISTORY_ENABLED = 'false';
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    for (let i = 0; i < 12; i++) {
      await p.message.create({
        data: { chatId, role: 'USER', content: `bulk ${i}` },
      });
    }
    await p.$disconnect();

    // Reload flags so new env is picked up
    const reloadRes = await app.inject({
      method: 'POST',
      url: '/admin/flags/reload',
      headers: { 'x-admin-token': 'admin' },
    });
    expect(reloadRes.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: `/api/chats/${chatId}/history`,
      headers: { authorization: `Bearer ${token}`, 'x-firebase-appcheck': APPCHECK },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(10);

    delete process.env.CHAT_HISTORY_ENABLED;
  });
});
