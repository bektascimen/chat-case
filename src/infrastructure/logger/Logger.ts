import pino, { type Logger as PinoLogger } from 'pino';
import type { Config } from '@/infrastructure/config/Config';

export type Logger = PinoLogger;

export class LoggerFactory {
  private static instance: Logger | null = null;

  static getInstance(config: Config): Logger {
    if (!this.instance) {
      this.instance = pino({
        level: config.logLevel,
        base: { service: 'appnation-chat', env: config.env },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers["x-firebase-appcheck"]',
            '*.password',
            '*.apiKey',
            '*.jwt',
            '*.token',
          ],
          censor: '[REDACTED]',
        },
        transport:
          config.env === 'development'
            ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } }
            : undefined,
      });
    }
    return this.instance;
  }

  static resetForTesting(): void {
    this.instance = null;
  }
}
