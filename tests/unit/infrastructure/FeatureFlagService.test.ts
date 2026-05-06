import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { Logger } from '@/infrastructure/logger/Logger';

const noopLogger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
  child: () => noopLogger,
} as unknown as Logger;

describe('FeatureFlagService', () => {
  beforeEach(() => {
    FeatureFlagService.resetForTesting();
    delete process.env.STREAMING_ENABLED;
    delete process.env.PAGINATION_LIMIT;
    delete process.env.AI_TOOLS_ENABLED;
    delete process.env.CHAT_HISTORY_ENABLED;
    delete process.env.RATE_LIMIT_PER_MINUTE;
  });

  it('returns defaults when nothing set', () => {
    const svc = FeatureFlagService.getInstance(noopLogger);
    expect(svc.isEnabled('STREAMING_ENABLED')).toBe(true);
    expect(svc.getNumber('PAGINATION_LIMIT')).toBe(20);
    expect(svc.isEnabled('AI_TOOLS_ENABLED')).toBe(false);
    expect(svc.isEnabled('CHAT_HISTORY_ENABLED')).toBe(true);
    expect(svc.getNumber('RATE_LIMIT_PER_MINUTE')).toBe(60);
  });

  it('env vars override defaults (string→bool/number coercion)', () => {
    process.env.STREAMING_ENABLED = 'false';
    process.env.PAGINATION_LIMIT = '50';
    process.env.AI_TOOLS_ENABLED = 'true';
    const svc = FeatureFlagService.getInstance(noopLogger);
    expect(svc.isEnabled('STREAMING_ENABLED')).toBe(false);
    expect(svc.getNumber('PAGINATION_LIMIT')).toBe(50);
    expect(svc.isEnabled('AI_TOOLS_ENABLED')).toBe(true);
  });

  it('clamps PAGINATION_LIMIT outside 10-100 to default', () => {
    process.env.PAGINATION_LIMIT = '5'; // below min
    const svc = FeatureFlagService.getInstance(noopLogger);
    // Invalid → falls back to defaults, full set kept consistent
    expect(svc.getNumber('PAGINATION_LIMIT')).toBe(20);
  });

  it('reload re-reads env', () => {
    const svc = FeatureFlagService.getInstance(noopLogger);
    expect(svc.getNumber('PAGINATION_LIMIT')).toBe(20);
    process.env.PAGINATION_LIMIT = '75';
    svc.reload();
    expect(svc.getNumber('PAGINATION_LIMIT')).toBe(75);
  });

  it('snapshot returns frozen copy', () => {
    const svc = FeatureFlagService.getInstance(noopLogger);
    const snap = svc.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });
});
