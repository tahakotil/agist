# Contributing to Agist

We welcome contributions of all kinds.

## Development Setup

```bash
git clone https://github.com/tahakotil/agist.git
cd agist
pnpm install

# Start backend
cd packages/server && npx tsx src/index.ts

# Start frontend (separate terminal)
cd packages/web && npx next dev -p 3004
```

## Project Structure

- `packages/shared` — Types and validators (edit here first when adding new entities)
- `packages/db` — SQLite schema and queries
- `packages/server` — Hono REST API, WebSocket, scheduler
- `packages/web` — Next.js dashboard with shadcn/ui

## Commit Convention

```
feat: add agent cost chart
fix: resolve WebSocket reconnect issue
docs: update API reference
chore: upgrade dependencies
```

## Pull Request Process

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make changes with tests
4. Commit with conventional message
5. Push and open a PR

## Code Style

- TypeScript strict mode
- No `any` types
- Zod for runtime validation
- nanoid for IDs
- ISO 8601 UTC for dates
- Cents (integer) for money
