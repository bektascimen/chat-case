import type { IAiProvider, AiEvent, AiMessage, ToolDef } from './IAiProvider';
import type { Logger } from '@/infrastructure/logger/Logger';

export type RetryOptions = {
  /** Total attempts including the first try (e.g., 3 = 1 initial + 2 retries). */
  maxAttempts: number;
  /** Initial backoff delay in ms (e.g., 200). */
  baseDelayMs: number;
  /** Cap on the per-attempt sleep in ms (e.g., 5000). */
  maxDelayMs: number;
  /** 0..1 — fractional jitter applied to each delay (0.2 = +/- 20%). */
  jitterRatio: number;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Decorator that wraps an inner {@link IAiProvider} with retry-with-exponential-
 * backoff semantics for transient pre-stream failures (auth blips, network
 * unreachable, immediate 5xx). Sits INSIDE the circuit breaker, so successful
 * retries never count toward the breaker's failure tally.
 *
 * Important nuance: events are yielded as they arrive — we do NOT buffer the
 * full stream before yielding (SSE consumers expect tokens incrementally).
 * This means once we have yielded one event, we cannot retry mid-stream
 * (the consumer already saw partial output); mid-stream errors propagate.
 */
export class RetryAiProvider implements IAiProvider {
  constructor(
    private readonly inner: IAiProvider,
    private readonly opts: RetryOptions,
    private readonly logger: Logger,
    private readonly sleepFn: (ms: number) => Promise<void> = sleep,
    private readonly randomFn: () => number = Math.random,
  ) {}

  async *stream(opts: { messages: AiMessage[]; tools?: ToolDef[] }): AsyncIterable<AiEvent> {
    let attempt = 0;
    while (true) {
      attempt += 1;
      let yielded = false;
      try {
        for await (const event of this.inner.stream(opts)) {
          yielded = true;
          yield event;
        }
        return; // success
      } catch (err) {
        // If we already started yielding, we cannot retry — propagate.
        if (yielded) {
          this.logger.warn(
            { err, attempt },
            'inner provider failed mid-stream — cannot retry, propagating',
          );
          throw err;
        }
        // Pre-yield failure: retry if attempts remain.
        if (attempt >= this.opts.maxAttempts) {
          this.logger.warn(
            { err, attempt, maxAttempts: this.opts.maxAttempts },
            'retry exhausted',
          );
          throw err;
        }
        const delay = this.computeDelay(attempt);
        this.logger.info(
          { err, attempt, nextDelayMs: delay },
          'retrying after transient failure',
        );
        await this.sleepFn(delay);
      }
    }
  }

  private computeDelay(attempt: number): number {
    // exponential: base * 2^(attempt-1), capped at maxDelayMs, with +/- jitter
    const expo = Math.min(this.opts.baseDelayMs * 2 ** (attempt - 1), this.opts.maxDelayMs);
    const jitter = expo * this.opts.jitterRatio * (this.randomFn() * 2 - 1);
    return Math.max(0, Math.round(expo + jitter));
  }
}
