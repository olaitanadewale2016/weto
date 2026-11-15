# Local Setup & Migration Runbook

## Prerequisites
- Node.js 20+
- Docker & Docker Compose (for local MongoDB replica set `rs0` & Redis)
- FFmpeg binary installed (optional, for background video transcoding in `worker/index.ts`)

## Environment Setup
1. Copy `.env.example` to `.env.local`.
2. Start local MongoDB (`rs0` single-node replica set, required for ACID transactions) and Redis:
   ```bash
   docker compose up -d
   ```
3. Install dependencies and seed initial system metadata:
   ```bash
   npm install
   npm run seed
   ```
4. Launch all three processes simultaneously:
   ```bash
   npm run dev:all
   ```

## Migrating Existing PHP/MySQL Data
1. Set `MYSQL_URL` (or `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`) and `SOURCE_STORAGE_PATH` in `.env.local`.
2. Dry-run schema mapping first:
   ```bash
   npx tsx scripts/migrate/mysql-to-mongo.ts --dry-run
   ```
3. Run data migration:
   ```bash
   npm run migrate:data
   npm run migrate:firebase
   npm run migrate:media
   npm run migrate:verify
   ```
