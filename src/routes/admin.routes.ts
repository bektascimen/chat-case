import type { FastifyInstance } from 'fastify';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { Config } from '@/infrastructure/config/Config';
import { ForbiddenError } from '@/errors/ForbiddenError';

type Deps = { flags: FeatureFlagService; config: Config };

export async function adminRoutes(app: FastifyInstance, deps: Deps) {
  // Admin routes require X-Admin-Token (separate from the bearer/appcheck used
  // by the user-facing API). Declaring `security: [{ adminToken: [] }]` here
  // overrides the global Bearer/AppCheck security scheme so Swagger UI's
  // "Authorize" dialog shows the right header for /admin/* endpoints.
  const adminSchema = {
    security: [{ adminToken: [] }],
    tags: ['admin'],
  } as const;

  app.post('/admin/flags/reload', { schema: adminSchema }, async (req, reply) => {
    const token = req.headers['x-admin-token'];
    const tokenStr = Array.isArray(token) ? token[0] : token;
    if (tokenStr !== deps.config.adminToken) {
      throw new ForbiddenError('Invalid admin token');
    }
    const result = deps.flags.reload();
    return reply.send({ ok: result.ok, error: result.error, snapshot: deps.flags.snapshot() });
  });

  app.get('/admin/flags', { schema: adminSchema }, async (req, reply) => {
    const token = req.headers['x-admin-token'];
    const tokenStr = Array.isArray(token) ? token[0] : token;
    if (tokenStr !== deps.config.adminToken) {
      throw new ForbiddenError('Invalid admin token');
    }
    return reply.send({ snapshot: deps.flags.snapshot() });
  });
}
