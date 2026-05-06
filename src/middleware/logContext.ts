import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    clientType?: 'web' | 'mobile' | 'desktop' | 'unknown';
  }
}

export async function logContextMiddleware(req: FastifyRequest, _reply: FastifyReply) {
  // Fastify already attaches req.id and req.log child. Enrich child with user/clientType once known.
  // We re-bind req.log after subsequent middleware sets req.user / req.clientType.
  req.log = req.log.child({
    requestId: req.id,
    ...(req.user ? { userId: req.user.id } : {}),
    ...(req.clientType ? { clientType: req.clientType } : {}),
  });
}
