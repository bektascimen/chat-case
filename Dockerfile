# syntax=docker/dockerfile:1.6

# Single-stage image: tsx runs TypeScript directly (path aliases resolved at
# runtime via tsconfig). Skipping `tsc` build avoids the path-alias rewrite
# step (`@/...` imports stay un-rewritten by `tsc` and would fail under
# plain `node`). Type-checking happens in CI (`npm run typecheck`).
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npx tsx src/server.ts"]
