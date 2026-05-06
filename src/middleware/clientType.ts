import type { FastifyRequest, FastifyReply } from 'fastify';

export async function clientTypeMiddleware(req: FastifyRequest, _reply: FastifyReply) {
  const explicit = req.headers['x-client-type'];
  const explicitStr = Array.isArray(explicit) ? explicit[0] : explicit;

  if (explicitStr === 'web' || explicitStr === 'mobile' || explicitStr === 'desktop') {
    req.clientType = explicitStr;
    return;
  }

  const ua = (req.headers['user-agent'] ?? '').toLowerCase();
  if (/(iphone|ipad|android|mobile)/.test(ua)) req.clientType = 'mobile';
  else if (/(electron)/.test(ua)) req.clientType = 'desktop';
  else if (/(mozilla|chrome|safari|firefox|edge)/.test(ua)) req.clientType = 'web';
  else req.clientType = 'unknown';
}
