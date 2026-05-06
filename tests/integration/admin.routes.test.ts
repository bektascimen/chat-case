import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, stopTestDb } from './helpers/testDb';
import { buildTestApp, seedFixture } from './helpers/testApp';
import type { FastifyInstance } from 'fastify';

describe('Admin routes (integration)', () => {
  let app: FastifyInstance;
  let dbUrl: string;

  beforeAll(async () => {
    dbUrl = await startTestDb();
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-1234567890';
    process.env.APP_CHECK_TOKEN = 'mock-app-check-token';
    process.env.ADMIN_TOKEN = 'admin';
    process.env.AI_PROVIDER = 'mock';
    await seedFixture(dbUrl);
    const built = await buildTestApp();
    app = built.app;
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await stopTestDb();
  });

  it('GET /admin/flags rejects missing token with 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/flags' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('POST /admin/flags/reload rejects wrong token with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/flags/reload',
      headers: { 'x-admin-token': 'wrong-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('POST /admin/flags/reload accepts correct token and returns ok=true + snapshot', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/flags/reload',
      headers: { 'x-admin-token': 'admin' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshot).toMatchObject({
      STREAMING_ENABLED: expect.any(Boolean),
      PAGINATION_LIMIT: expect.any(Number),
    });
  });

  it('GET /admin/flags accepts correct token and returns snapshot', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/flags',
      headers: { 'x-admin-token': 'admin' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.snapshot.STREAMING_ENABLED).toBeTypeOf('boolean');
  });
});
