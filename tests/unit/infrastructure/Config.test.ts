import { describe, it, expect, beforeEach } from 'vitest';
import { Config } from '@/infrastructure/config/Config';

describe('Config', () => {
  beforeEach(() => {
    Config.resetForTesting();
  });

  it('parses required env vars', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
    process.env.JWT_SECRET = 'x'.repeat(16);
    process.env.APP_CHECK_TOKEN = 'tok';
    process.env.ADMIN_TOKEN = 'adm';
    process.env.AI_PROVIDER = 'mock';
    process.env.LOG_LEVEL = 'info';

    const cfg = Config.getInstance();
    expect(cfg.env).toBe('test');
    expect(cfg.port).toBe(3000);
    expect(cfg.aiProvider).toBe('mock');
  });

  it('throws when required vars missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => Config.getInstance()).toThrow();
  });

  it('returns same instance', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/db';
    process.env.JWT_SECRET = 'x'.repeat(16);
    const a = Config.getInstance();
    const b = Config.getInstance();
    expect(a).toBe(b);
  });
});
