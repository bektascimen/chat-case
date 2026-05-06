import { describe, it, expect } from 'vitest';
import { NotFoundError } from '@/errors/NotFoundError';
import { ValidationError } from '@/errors/ValidationError';
import { FeatureDisabledError } from '@/errors/FeatureDisabledError';
import { RateLimitError } from '@/errors/RateLimitError';

describe('AppError hierarchy', () => {
  it('NotFoundError has 404 + code', () => {
    const e = new NotFoundError('chat not found');
    expect(e.statusCode).toBe(404);
    expect(e.errorCode).toBe('NOT_FOUND');
    expect(e.message).toBe('chat not found');
    expect(e.name).toBe('NotFoundError');
  });

  it('ValidationError carries issues', () => {
    const e = new ValidationError('bad', [{ path: 'a', message: 'b' }]);
    expect(e.issues[0]).toEqual({ path: 'a', message: 'b' });
  });

  it('FeatureDisabledError is 403/FEATURE_DISABLED', () => {
    const e = new FeatureDisabledError('off');
    expect(e.statusCode).toBe(403);
    expect(e.errorCode).toBe('FEATURE_DISABLED');
  });

  it('RateLimitError is 429', () => {
    expect(new RateLimitError('too many').statusCode).toBe(429);
  });
});
