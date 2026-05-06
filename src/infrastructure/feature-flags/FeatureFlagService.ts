import fs from 'node:fs';
import path from 'node:path';
import { featureFlagSchema, type FeatureFlags, type BooleanFlag, type NumericFlag } from './flags';
import type { Logger } from '@/infrastructure/logger/Logger';

const CONFIG_FILE = path.resolve(process.cwd(), 'config/feature-flags.json');

export class FeatureFlagService {
  private static instance: FeatureFlagService | null = null;
  private flags: FeatureFlags;
  private watcher: fs.FSWatcher | null = null;

  private constructor(private readonly logger: Logger) {
    this.flags = this.loadFlags();
  }

  static getInstance(logger: Logger): FeatureFlagService {
    if (!this.instance) this.instance = new FeatureFlagService(logger);
    return this.instance;
  }

  static resetForTesting(): void {
    this.instance?.stopWatching();
    this.instance = null;
  }

  isEnabled(flag: BooleanFlag): boolean {
    return this.flags[flag] as boolean;
  }

  getNumber(flag: NumericFlag): number {
    return this.flags[flag] as number;
  }

  snapshot(): Readonly<FeatureFlags> {
    return Object.freeze({ ...this.flags });
  }

  reload(): { ok: boolean; error?: string } {
    try {
      const next = this.loadFlags();
      this.flags = next;
      this.logger.info({ flags: this.snapshot() }, 'feature flags reloaded');
      return { ok: true };
    } catch (err) {
      this.logger.error({ err }, 'feature flag reload failed; keeping previous values');
      return { ok: false, error: (err as Error).message };
    }
  }

  startWatching(): void {
    if (this.watcher || !fs.existsSync(CONFIG_FILE)) return;
    this.watcher = fs.watch(CONFIG_FILE, () => {
      this.logger.info('flag config file changed, reloading');
      this.reload();
    });
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private loadFlags(): FeatureFlags {
    const fileFlags = this.readFile();
    const envFlags = this.readEnv();
    const merged = { ...fileFlags, ...envFlags };
    const parsed = featureFlagSchema.safeParse(merged);
    if (!parsed.success) {
      this.logger.error(
        { issues: parsed.error.issues },
        'invalid feature flag config — falling back to all defaults',
      );
      return featureFlagSchema.parse({});
    }
    return parsed.data;
  }

  private readFile(): Record<string, unknown> {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;
    } catch (err) {
      this.logger.error({ err }, 'failed to read feature flag file');
      return {};
    }
  }

  private readEnv(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const keys: (keyof FeatureFlags)[] = [
      'STREAMING_ENABLED',
      'PAGINATION_LIMIT',
      'AI_TOOLS_ENABLED',
      'CHAT_HISTORY_ENABLED',
      'RATE_LIMIT_PER_MINUTE',
      'COMPLETION_ENABLED',
    ];
    for (const k of keys) {
      const v = process.env[k];
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
}
