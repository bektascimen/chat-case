import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@/infrastructure/database/PrismaClient';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { CircuitBreaker } from '@/infrastructure/ai/CircuitBreaker';

type Deps = {
  prisma: PrismaClient;
  flags: FeatureFlagService;
  /** Null when the Mock provider is in use (no breaker is wired). */
  circuitBreaker: CircuitBreaker | null;
};

type CheckResult = { status: 'up' | 'down'; detail?: unknown };

/**
 * Liveness/readiness probes. Registered without auth so that Kubernetes /
 * load balancers can hit them. `/health/live` is intentionally trivial
 * (process responds at all); `/health/ready` exercises the real
 * dependencies (DB, feature flags, circuit breaker state).
 */
export async function healthRoutes(app: FastifyInstance, deps: Deps) {
  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_req, reply) => {
    const checks: Record<string, CheckResult> = {};

    // Database — cheap raw ping that any healthy Postgres responds to.
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'up' };
    } catch (err) {
      checks.database = { status: 'down', detail: (err as Error).message };
    }

    // Feature flags — the snapshot itself is in-memory, but a thrown error here
    // means the singleton was never initialised correctly.
    try {
      const snap = deps.flags.snapshot();
      checks.featureFlags = { status: 'up', detail: snap };
    } catch (err) {
      checks.featureFlags = { status: 'down', detail: (err as Error).message };
    }

    // Circuit breaker — only meaningful when a real provider is wired. With the
    // Mock provider in place there is no breaker, which we report as "up" (it
    // cannot fail meaningfully).
    if (deps.circuitBreaker) {
      const snap = deps.circuitBreaker.snapshot();
      checks.llmCircuitBreaker = {
        status: snap.state === 'OPEN' ? 'down' : 'up',
        detail: snap,
      };
    } else {
      checks.llmCircuitBreaker = { status: 'up', detail: 'mock provider — no breaker' };
    }

    const allUp = Object.values(checks).every((c) => c.status === 'up');
    return reply.status(allUp ? 200 : 503).send({
      status: allUp ? 'ok' : 'degraded',
      checks,
    });
  });
}
