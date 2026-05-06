import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

export const featureFlagSchema = z.object({
  STREAMING_ENABLED: boolFromString.default(true),
  PAGINATION_LIMIT: z.coerce.number().int().min(10).max(100).default(20),
  AI_TOOLS_ENABLED: boolFromString.default(false),
  CHAT_HISTORY_ENABLED: boolFromString.default(true),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(60),
  COMPLETION_ENABLED: boolFromString.default(true),
});

export type FeatureFlags = z.infer<typeof featureFlagSchema>;

export type BooleanFlag = {
  [K in keyof FeatureFlags]: FeatureFlags[K] extends boolean ? K : never;
}[keyof FeatureFlags];

export type NumericFlag = {
  [K in keyof FeatureFlags]: FeatureFlags[K] extends number ? K : never;
}[keyof FeatureFlags];
