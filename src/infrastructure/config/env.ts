import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),

    DATABASE_URL: z.url(),

    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
    APP_CHECK_TOKEN: z.string().min(1).default('mock-app-check-token'),
    ADMIN_TOKEN: z.string().min(1).default('dev-admin-token'),

    AI_PROVIDER: z.enum(['mock', 'openai', 'gemini']).default('mock'),
    OPENAI_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),

    LLM_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(100).default(5),
    LLM_CIRCUIT_RESET_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(30_000),
    LLM_CIRCUIT_FALLBACK: z.enum(['mock', 'throw']).default('mock'),

    LLM_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    LLM_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(200),
    LLM_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(0).max(120_000).default(5_000),
    LLM_RETRY_JITTER_RATIO: z.coerce.number().min(0).max(1).default(0.2),

    LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),

    // Optional flag overrides — read by FeatureFlagService, not Config
    STREAMING_ENABLED: z.string().optional(),
    PAGINATION_LIMIT: z.string().optional(),
    AI_TOOLS_ENABLED: z.string().optional(),
    CHAT_HISTORY_ENABLED: z.string().optional(),
    RATE_LIMIT_PER_MINUTE: z.string().optional(),
  })
  .refine((env) => env.AI_PROVIDER !== 'openai' || !!env.OPENAI_API_KEY, {
    message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai',
    path: ['OPENAI_API_KEY'],
  })
  .refine((env) => env.AI_PROVIDER !== 'gemini' || !!env.GEMINI_API_KEY, {
    message: 'GEMINI_API_KEY is required when AI_PROVIDER=gemini',
    path: ['GEMINI_API_KEY'],
  });

export type Env = z.infer<typeof envSchema>;
