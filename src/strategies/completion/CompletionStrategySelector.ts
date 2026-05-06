import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { ICompletionStrategy } from './ICompletionStrategy';
import type { StreamingCompletionStrategy } from './StreamingCompletionStrategy';
import type { JsonCompletionStrategy } from './JsonCompletionStrategy';

export class CompletionStrategySelector {
  constructor(
    private readonly flags: FeatureFlagService,
    private readonly streaming: StreamingCompletionStrategy,
    private readonly json: JsonCompletionStrategy,
  ) {}

  select(): ICompletionStrategy {
    return this.flags.isEnabled('STREAMING_ENABLED') ? this.streaming : this.json;
  }
}
