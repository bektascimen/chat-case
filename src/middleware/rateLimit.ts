import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';

/**
 * Per-route rate limit options for use under `routeOptions.config.rateLimit`.
 * `@fastify/rate-limit` v10 requires `max` to be `(req, key) => number` and
 * `keyGenerator` to take a `FastifyRequest`. The keyGenerator prefers the
 * authenticated user id so multiple devices behind a NAT do not share a bucket.
 */
export function buildRateLimitOptions(flags: FeatureFlagService) {
  return {
    max: (_req: FastifyRequest, _key: string) => flags.getNumber('RATE_LIMIT_PER_MINUTE'),
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => req.user?.id ?? req.ip,
  } as const;
}

// Convenience: register the plugin app-wide once but apply per-route via config
export async function registerRateLimitPlugin(app: FastifyInstance, flags: FeatureFlagService) {
  const { default: rateLimit } = await import('@fastify/rate-limit');
  await app.register(rateLimit, {
    global: false, // route-specific only
    ...buildRateLimitOptions(flags),
  });
}
