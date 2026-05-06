import { PrismaClient as BasePrisma } from '@prisma/client';
import type { Config } from '@/infrastructure/config/Config';
import type { Logger } from '@/infrastructure/logger/Logger';

export type PrismaClient = BasePrisma;

export class PrismaClientFactory {
  private static instance: BasePrisma | null = null;

  static getInstance(config: Config, logger: Logger): BasePrisma {
    if (!this.instance) {
      const client = new BasePrisma({
        datasources: { db: { url: config.databaseUrl } },
        log: [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
      });

      // Cast required because @prisma/client emits typed events
      (client as unknown as { $on: (e: 'query' | 'error' | 'warn', cb: (ev: unknown) => void) => void })
        .$on('error', (e) => logger.error({ prismaEvent: e }, 'prisma error'));
      (client as unknown as { $on: (e: 'query' | 'error' | 'warn', cb: (ev: unknown) => void) => void })
        .$on('warn', (e) => logger.warn({ prismaEvent: e }, 'prisma warn'));
      if (config.logLevel === 'debug' || config.logLevel === 'trace') {
        (client as unknown as { $on: (e: 'query' | 'error' | 'warn', cb: (ev: unknown) => void) => void })
          .$on('query', (e) => logger.debug({ prismaEvent: e }, 'prisma query'));
      }

      this.instance = client;
    }
    return this.instance;
  }

  static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.$disconnect();
      this.instance = null;
    }
  }

  static resetForTesting(): void {
    this.instance = null;
  }
}
