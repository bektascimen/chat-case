/* eslint-disable no-console -- this is a CLI seed script; console IS the user-facing output */
import { PrismaClient, Prisma } from '@prisma/client';
import type { MessageRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Idempotent: skip if data already exists. Reviewers running flag toggles
  // (`STREAMING_ENABLED=false docker compose up`) restart the container —
  // wiping the DB on every boot would change chat/message IDs and break the
  // README walkthrough. To re-seed, run `docker compose down -v` to drop the
  // postgres volume.
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`Seed skipped: ${existingUsers} users already exist`);
    return;
  }

  const alice = await prisma.user.create({
    data: { id: '11111111-1111-1111-1111-111111111111', email: 'alice@example.com', name: 'Alice' },
  });
  const bob = await prisma.user.create({
    data: { id: '22222222-2222-2222-2222-222222222222', email: 'bob@example.com', name: 'Bob' },
  });

  for (const user of [alice, bob]) {
    for (let i = 1; i <= 3; i++) {
      const chat = await prisma.chat.create({
        data: { userId: user.id, title: `${user.name}'s chat #${i}` },
      });

      const msgs: { role: MessageRole; content: string; metadata?: Prisma.InputJsonValue }[] = [
        { role: 'USER', content: `Hello from ${user.name} message 1 in chat ${i}` },
        { role: 'ASSISTANT', content: 'Hi! How can I help you today?' },
        { role: 'USER', content: 'What is the weather in Istanbul?' },
        {
          role: 'ASSISTANT',
          content: 'It is 18°C and sunny in Istanbul.',
          metadata: {
            toolCalls: [
              { name: 'getCurrentWeather', args: { city: 'Istanbul' }, result: { tempC: 18, condition: 'sunny' } },
            ],
          },
        },
        { role: 'USER', content: 'Thanks!' },
        { role: 'ASSISTANT', content: 'You are welcome.' },
      ];

      for (const m of msgs) {
        await prisma.message.create({
          data: {
            chatId: chat.id,
            role: m.role,
            content: m.content,
            metadata: m.metadata ?? Prisma.JsonNull,
          },
        });
      }
    }
  }

  console.log('Seed complete: 2 users, 6 chats, 36 messages');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
