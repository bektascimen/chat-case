import type { IAiProvider, AiEvent, AiMessage, ToolDef } from './IAiProvider';
import type { CircuitBreaker } from '../CircuitBreaker';
import type { Logger } from '@/infrastructure/logger/Logger';
import { ServiceUnavailableError } from '@/errors/ServiceUnavailableError';

export type CircuitBreakerFallbackMode = 'mock' | 'throw';

/**
 * Thrown when the breaker is OPEN and no Mock fallback is configured. Maps to
 * HTTP 503 SERVICE_UNAVAILABLE via the global error handler (it's an AppError).
 */
export class CircuitBreakerOpenError extends ServiceUnavailableError {
  constructor(message = 'AI provider circuit is open; requests are temporarily blocked') {
    super(message, { code: 'CIRCUIT_OPEN' });
  }
}

export class CircuitBreakerAiProvider implements IAiProvider {
  constructor(
    private readonly inner: IAiProvider,
    private readonly breaker: CircuitBreaker,
    private readonly logger: Logger,
    private readonly fallback: IAiProvider | null, // null when fallback mode is 'throw'
  ) {}

  async *stream(opts: { messages: AiMessage[]; tools?: ToolDef[] }): AsyncIterable<AiEvent> {
    if (!this.breaker.canPass()) {
      this.logger.warn(
        { breaker: this.breaker.snapshot() },
        'circuit breaker open — using fallback',
      );
      if (this.fallback) {
        yield* this.fallback.stream(opts);
        return;
      }
      throw new CircuitBreakerOpenError();
    }

    let sawDone = false;
    try {
      for await (const event of this.inner.stream(opts)) {
        yield event;
        if (event.type === 'done') sawDone = true;
      }
      if (sawDone) {
        this.breaker.recordSuccess();
      } else {
        this.breaker.recordFailure();
        this.logger.warn(
          { breaker: this.breaker.snapshot() },
          'stream ended without done event — recorded failure',
        );
      }
    } catch (err) {
      this.breaker.recordFailure();
      this.logger.error(
        { err, breaker: this.breaker.snapshot() },
        'inner provider threw — recorded failure',
      );
      // If we already started yielding events to the consumer, we cannot fall back mid-stream.
      // If we hadn't yielded anything yet AND fallback exists, we could try fallback — but tracking that
      // is complex; safer to just rethrow. The next request will see the breaker state and use fallback.
      throw err;
    }
  }
}
