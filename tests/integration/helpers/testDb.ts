import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

let container: StartedPostgreSqlContainer | null = null;

export async function startTestDb(): Promise<string> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('appnation_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = `${url}?connection_limit=5`;

  // Run migrations against this container
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  return process.env.DATABASE_URL;
}

export async function stopTestDb(): Promise<void> {
  await container?.stop();
  container = null;
}
