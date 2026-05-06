import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/container.ts',
        'src/routes/**', // thin Fastify wiring; covered via integration tests
        // Real third-party-SDK providers (OpenAI / Gemini) wrap the Vercel AI
        // SDK and require live API keys + network for meaningful coverage.
        // They are exercised end-to-end in manual / CI smoke runs; the
        // resilience layer above them (CircuitBreaker, Retry) is unit-tested
        // and Mock provider drives all integration tests.
        'src/infrastructure/ai/providers/OpenAiProvider.ts',
        'src/infrastructure/ai/providers/GeminiProvider.ts',
        'src/**/*.d.ts',
        'src/**/I*.ts',
        'src/**/interfaces/**',
      ],
      // Thresholds reflect the now-comprehensive unit + integration suite. The
      // resilience chain, strategies (incl. tool-call/tool-error paths), services,
      // errors, repositories (incl. cursor edge cases), and admin auth all have
      // dedicated tests. Tighten further as features are added.
      thresholds: { lines: 80, branches: 70, functions: 80, statements: 75 },
    },
  },
});
