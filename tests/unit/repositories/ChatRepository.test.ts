import { describe, it, expect, vi } from 'vitest';
import { ChatRepository } from '@/repositories/ChatRepository';
import type { PrismaClient } from '@prisma/client';

function fakePrisma(rows: unknown[] = []): PrismaClient {
  return {
    chat: {
      findMany: vi.fn().mockResolvedValue(rows),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  } as unknown as PrismaClient;
}

describe('ChatRepository.list — cursor decoding', () => {
  it('treats malformed (non-base64) cursor as null and returns first page', async () => {
    const prisma = fakePrisma([]);
    const repo = new ChatRepository(prisma);
    await repo.list('user-1', { cursor: 'not%a&valid_cursor!!!', limit: 20 });
    const findManyMock = prisma.chat.findMany as ReturnType<typeof vi.fn>;
    const findManyArgs = findManyMock.mock.calls[0]?.[0];
    // No OR clause when cursor decode fails (treated as no cursor)
    expect(findManyArgs.where.OR).toBeUndefined();
    expect(findManyArgs.where.userId).toBe('user-1');
  });

  it('treats cursor with invalid date as null and returns first page', async () => {
    const prisma = fakePrisma([]);
    const repo = new ChatRepository(prisma);
    // base64url encoded "not-a-date|some-id" → decodes but date parses to NaN
    const badCursor = Buffer.from('not-a-date|some-id', 'utf8').toString('base64url');
    await repo.list('user-1', { cursor: badCursor, limit: 20 });
    const findManyMock = prisma.chat.findMany as ReturnType<typeof vi.fn>;
    const findManyArgs = findManyMock.mock.calls[0]?.[0];
    expect(findManyArgs.where.OR).toBeUndefined();
  });

  it('encodes nextCursor when hasMore=true', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `chat-${i}`,
      userId: 'user-1',
      title: `c${i}`,
      createdAt: new Date(),
      updatedAt: new Date(2026, 0, i + 1),
    }));
    const prisma = fakePrisma(rows);
    const repo = new ChatRepository(prisma);
    const result = await repo.list('user-1', { limit: 10 });
    expect(result.data).toHaveLength(10);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBeTruthy();
    // cursor should be base64url; decoding gives ISO|id
    const decoded = Buffer.from(result.pagination.nextCursor!, 'base64url').toString('utf8');
    expect(decoded).toMatch(/^.+\|chat-9$/);
  });
});
