import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IAuthVerifier, AuthenticatedUser } from './verifiers/IAuthVerifier';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export function authMiddleware(verifier: IAuthVerifier) {
  return async function (req: FastifyRequest, _reply: FastifyReply) {
    const user = await verifier.verify(req.headers.authorization);
    req.user = user;
  };
}
