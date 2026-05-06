export type CircuitBreakerOptions = {
  failureThreshold: number; // N consecutive fails before tripping (e.g. 5)
  resetTimeoutMs: number; // how long OPEN stays before HALF_OPEN (e.g. 30000)
};

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private nextAttemptAt = 0;
  private now: () => number;

  constructor(
    private readonly opts: CircuitBreakerOptions,
    nowFn?: () => number, // injectable for tests
  ) {
    this.now = nowFn ?? Date.now;
  }

  /** Returns true if a request can proceed; mutates state if transitioning OPEN→HALF_OPEN. */
  canPass(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'HALF_OPEN') return true; // one probe will be allowed by canPass; multiple races are OK because recordSuccess/Failure converge
    // OPEN
    if (this.now() >= this.nextAttemptAt) {
      this.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      // Probe failed — back to OPEN with extended cooldown
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.opts.failureThreshold) {
      this.trip();
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  /** For diagnostics / admin endpoint */
  snapshot(): { state: CircuitState; failures: number; nextAttemptAt: number | null } {
    return {
      state: this.state,
      failures: this.failures,
      nextAttemptAt: this.state === 'OPEN' ? this.nextAttemptAt : null,
    };
  }

  private trip(): void {
    this.state = 'OPEN';
    this.nextAttemptAt = this.now() + this.opts.resetTimeoutMs;
  }
}
