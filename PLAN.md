# Kotivon Agent Platform — MVP Plan (1 Gün)

## Ürün: Açık kaynak AI agent orkestrasyon platformu
## Hedef: Paperclip'ten 10x daha iyi, 30 saniyede kurulum, Türkçe

## Tech Stack
- **Frontend:** Next.js 15 App Router + shadcn/ui + Tremor charts + React Flow (org chart)
- **Backend:** Hono (lightweight Node.js framework)
- **Database:** SQLite (better-sqlite3, WAL mode)
- **Real-time:** WebSocket (ws) + SSE
- **Auth:** Basit API key (MVP)
- **Package:** Monorepo (pnpm workspaces)

## Mimari

```
/packages
  /db          — SQLite schema, migrations, queries
  /server      — Hono API + WebSocket + SSE + Scheduler
  /web         — Next.js dashboard
  /cli         — npx komutu (setup + run)
  /shared      — Types, constants, validators (zod)
```

## MVP Özellikler (1 Gün)

### P0 — Çekirdek (ilk 4 saat)
1. DB schema: companies, agents, routines, triggers, runs, issues, comments
2. API: CRUD companies, agents, routines + triggers
3. Heartbeat scheduler: cron-based agent wake
4. Agent adapter: claude_local (claude CLI spawn)
5. Dashboard shell: sidebar, routing, dark mode

### P1 — Dashboard (saat 4-8)
6. Agent listesi + status kartları
7. Şirket sayfaları
8. Routine/schedule yönetimi
9. Canlı log streaming (WebSocket)
10. Run history timeline
11. Org chart (React Flow)

### P2 — Fark Yaratan (saat 8-12)
12. Maliyet grafikleri (Tremor)
13. Cmd+K command palette
14. Mobil responsive + PWA
15. Bildirim sistemi (toast + webhook)
16. Status board (tam ekran monitör görünümü)
17. Agent wake/pause/restart tek tıkla

### P3 — Polish (saat 12-16)
18. Türkçe + İngilizce i18n
19. Docker Compose
20. npx setup komutu
21. README + docs
22. Demo data seeder

## Paralel İş Dağılımı (10 Agent)

### Agent 1-2: Database + Shared Types
- SQLite schema tasarımı
- Zod validators
- TypeScript types
- Migration sistemi
- Query helpers (prepared statements)

### Agent 3-4: Backend API
- Hono server setup
- REST endpoints (companies, agents, routines, issues)
- WebSocket server (log streaming)
- SSE endpoint (status updates)
- Error handling middleware

### Agent 5: Scheduler + Adapter
- Cron parser + scheduler loop
- claude_local adapter (spawn claude CLI)
- Run tracking (start, progress, complete/fail)
- Session persistence

### Agent 6-7: Dashboard Shell + Pages
- Next.js app setup + shadcn/ui
- Layout: sidebar, header, breadcrumbs
- Pages: dashboard, companies, agents, routines, runs, settings
- Dark mode, responsive

### Agent 8: Dashboard Components
- Agent card component
- Run log viewer (virtual scroll)
- Org chart (React Flow)
- Schedule timeline

### Agent 9: Charts + Analytics
- Tremor cost charts
- Token usage sparklines
- Run success/fail pie chart
- Agent activity heatmap

### Agent 10: CLI + DevOps
- npx setup command
- Docker Compose
- README
- Demo seeder
