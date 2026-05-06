import { AppError } from './AppError';

/**
 * 503 — service degraded or temporarily unavailable. Used when the LLM
 * provider's circuit breaker is OPEN and the configured fallback mode is
 * `throw` (no Mock fallback).
 */
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly errorCode = 'SERVICE_UNAVAILABLE';
}
