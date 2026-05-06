import { envSchema, type Env } from './env';

export class Config {
  private static instance: Config | null = null;
  readonly env: Env['NODE_ENV'];
  readonly port: number;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly appCheckToken: string;
  readonly adminToken: string;
  readonly aiProvider: Env['AI_PROVIDER'];
  readonly openaiApiKey?: string;
  readonly geminiApiKey?: string;
  readonly llmCircuitFailureThreshold: number;
  readonly llmCircuitResetTimeoutMs: number;
  readonly llmCircuitFallback: 'mock' | 'throw';
  readonly llmRetryMaxAttempts: number;
  readonly llmRetryBaseDelayMs: number;
  readonly llmRetryMaxDelayMs: number;
  readonly llmRetryJitterRatio: number;
  readonly llmRequestTimeoutMs: number;
  readonly raw: Env;

  private constructor() {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    const e = parsed.data;
    this.env = e.NODE_ENV;
    this.port = e.PORT;
    this.logLevel = e.LOG_LEVEL;
    this.databaseUrl = e.DATABASE_URL;
    this.jwtSecret = e.JWT_SECRET;
    this.appCheckToken = e.APP_CHECK_TOKEN;
    this.adminToken = e.ADMIN_TOKEN;
    this.aiProvider = e.AI_PROVIDER;
    this.openaiApiKey = e.OPENAI_API_KEY;
    this.geminiApiKey = e.GEMINI_API_KEY;
    this.llmCircuitFailureThreshold = e.LLM_CIRCUIT_FAILURE_THRESHOLD;
    this.llmCircuitResetTimeoutMs = e.LLM_CIRCUIT_RESET_TIMEOUT_MS;
    this.llmCircuitFallback = e.LLM_CIRCUIT_FALLBACK;
    this.llmRetryMaxAttempts = e.LLM_RETRY_MAX_ATTEMPTS;
    this.llmRetryBaseDelayMs = e.LLM_RETRY_BASE_DELAY_MS;
    this.llmRetryMaxDelayMs = e.LLM_RETRY_MAX_DELAY_MS;
    this.llmRetryJitterRatio = e.LLM_RETRY_JITTER_RATIO;
    this.llmRequestTimeoutMs = e.LLM_REQUEST_TIMEOUT_MS;
    this.raw = e;
  }

  static getInstance(): Config {
    if (!this.instance) this.instance = new Config();
    return this.instance;
  }

  static resetForTesting(): void {
    this.instance = null;
  }
}
