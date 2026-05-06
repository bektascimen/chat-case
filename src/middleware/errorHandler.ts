import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { Prisma } from '@prisma/client';
import { AppError } from '@/errors/AppError';
import { ValidationError } from '@/errors/ValidationError';
import { NotFoundError } from '@/errors/NotFoundError';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler(async (error: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    const requestId = req.id;
    const timestamp = new Date().toISOString();

    // Fastify rate limit plugin sets statusCode 429
    if (error.statusCode === 429) {
      req.log.warn({ err: error }, 'rate limited');
      return reply.status(429).send({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', requestId, timestamp },
      });
    }

    if (error instanceof AppError) {
      const body: Record<string, unknown> = {
        code: error.errorCode,
        message: error.message,
        requestId,
        timestamp,
      };
      if (error instanceof ValidationError && error.issues.length) body.details = error.issues;
      req.log.warn({ err: error, errorCode: error.errorCode, ctx: error.context }, 'app error');
      return reply.status(error.statusCode).send({ error: body });
    }

    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => ({
        path: i.path.map(String).join('.'),
        message: i.message,
      }));
      req.log.warn({ issues }, 'validation error');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: issues,
          requestId,
          timestamp,
        },
      });
    }

    // fastify-type-provider-zod surfaces body/params/querystring validation
    // failures via Fastify's validation hook (NOT a thrown ZodError). Translate
    // these into our standard VALIDATION_ERROR envelope.
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((v) => ({
        path: v.instancePath.replace(/^\//, '').replace(/\//g, '.'),
        message: v.message ?? 'Invalid value',
      }));
      req.log.warn({ issues }, 'validation error');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: issues,
          requestId,
          timestamp,
        },
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      const e = new NotFoundError('Resource not found');
      req.log.warn({ err: error }, 'prisma not found');
      return reply
        .status(e.statusCode)
        .send({ error: { code: e.errorCode, message: e.message, requestId, timestamp } });
    }

    req.log.error({ err: error, stack: error.stack }, 'unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
        timestamp,
      },
    });
  });
}
