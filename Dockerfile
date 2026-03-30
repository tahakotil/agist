FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules/
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules/
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules/
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules/
COPY . .
RUN pnpm --filter @agist/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./
EXPOSE 4400 3004
CMD ["sh", "-c", "node packages/server/dist/index.js & npx next start packages/web -p 3004"]
