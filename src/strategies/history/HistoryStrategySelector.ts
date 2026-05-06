import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { IHistoryStrategy } from './IHistoryStrategy';
import type { FullHistoryStrategy } from './FullHistoryStrategy';
import type { LimitedHistoryStrategy } from './LimitedHistoryStrategy';

export class HistoryStrategySelector {
  constructor(
    private readonly flags: FeatureFlagService,
    private readonly full: FullHistoryStrategy,
    private readonly limited: LimitedHistoryStrategy,
  ) {}

  select(): IHistoryStrategy {
    return this.flags.isEnabled('CHAT_HISTORY_ENABLED') ? this.full : this.limited;
  }
}
