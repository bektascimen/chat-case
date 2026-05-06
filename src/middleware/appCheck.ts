import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IAppCheckVerifier } from './verifiers/IAppCheckVerifier';

export function appCheckMiddleware(verifier: IAppCheckVerifier) {
  return async function (req: FastifyRequest, _reply: FastifyReply) {
    const token = req.headers['x-firebase-appcheck'];
    const tokenStr = Array.isArray(token) ? token[0] : token;
    await verifier.verify(tokenStr);
  };
}
