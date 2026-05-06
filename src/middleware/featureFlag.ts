import type { FastifyRequest, FastifyReply } from 'fastify';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/FeatureFlagService';
import type { BooleanFlag } from '@/infrastructure/feature-flags/flags';
import { FeatureDisabledError } from '@/errors/FeatureDisabledError';

export function requireFeatureFlag(flags: FeatureFlagService, flag: BooleanFlag) {
  return async function (_req: FastifyRequest, _reply: FastifyReply) {
    if (!flags.isEnabled(flag)) {
      throw new FeatureDisabledError(`Feature '${flag}' is disabled`, { flag });
    }
  };
}
