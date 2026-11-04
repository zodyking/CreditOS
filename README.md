<p align="center">
  <img src="./brand/social/readme-banner.svg" alt="CreditOS — credit intelligence, under your control" width="100%" />
</p>

<p align="center">
  <strong>CreditOS</strong> is a self-hosted, AI-assisted personal credit intelligence and dispute operations platform.<br />
  Three-bureau report comparison · evidence-driven rules · a real multi-agent council · approval-gated physical mail · an inbound mailroom · honest freeze tracking.
</p>

<p align="center">
  <img alt="Nuxt 4" src="https://img.shields.io/badge/Nuxt-4.6-00DC82?logo=nuxt&logoColor=white" />
  <img alt="Vue 3.5" src="https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white" />
  <img alt="OpenRouter" src="https://img.shields.io/badge/AI-OpenRouter-9B6DFF" />
  <img alt="Dokploy ready" src="https://img.shields.io/badge/Deploy-Dokploy%20%2F%20Docker-0B1220" />
  <img alt="Tests" src="https://img.shields.io/badge/vitest-64%20passing-3DBE6E" />
</p>

---

## What it does

| Area | Summary |
| --- | --- |
| **Three-bureau reports** | Import Equifax, Experian and TransUnion reports (JSON import or synthetic demo data), preserve source facts and report dates, and compare matching tradelines without joining unrelated accounts. Scores are shown only when the source provided one. |
| **Monitoring** | Scheduled polling with visible last-check timestamps, deduplicated alerts, and reviewable tickets. No fake "real-time" claims. |
| **Rules engine** | An evidence-driven, explainable rule pack separates inaccuracies, identity theft, goodwill, furnisher disputes, collections questions and "needs more evidence". Every verdict lists evidence gaps, a legal basis and a *not legal advice* disclaimer. |
| **Case workspace** | A hero case page: contested fact and evidence on the left, the council transcript and factual timeline in the centre, the plan, illustrative response scenarios, correspondence and approvals on the right. |
| **Multi-agent council** | Six roles (evidence analyst, bureau specialist, furnisher/collections specialist, compliance reviewer, adversarial skeptic, decision chair) run three rounds — findings, critiques and replies, revised proposals — then cast recorded ballots. The chair is bound by hard gates (evidence, compliance, consent, fabrication check). Demo mode uses a deterministic simulator; live mode uses OpenRouter with structured outputs. |
| **Letters and approvals** | Versioned letter drafts, exact PDF rendering with SHA-256, an approval bundle that shows recipient, cost estimate, exhibits and consequences, and three explicit confirmations before anything is queued. |
| **Outbound mail** | Provider adapters (sandbox, PostGrid; DocuPost scaffold) with idempotent order creation, external order ids, signed webhooks and duplicate-callback suppression. |
| **Inbound mailroom** | Manual PDF/image upload today, connector architecture for scan providers. Text extraction, case matching, an unassigned triage inbox, response classification and automatic council reassessment. |
| **Freeze center** | Nine agencies (Equifax, Experian, TransUnion, Innovis, ChexSystems, LexisNexis, NCTUE, The Work Number, DataX) with guided requests, required evidence and a state machine that never marks a freeze confirmed without evidence. |
| **Operations** | Postgres-backed job queue with retries and dead-lettering, audit log, in-app notifications, server-sent events, encrypted secret storage, Demo/Test/Live labelling everywhere. |

> CreditOS is a personal operating tool, not legal advice. Dispute outcomes are never guaranteed, and the product never pretends a mock is live.

## Screenshots

| Dashboard | Case workspace (council) |
| --- | --- |
| ![Dashboard](./brand/screenshots/dashboard.png) | ![Case detail](./brand/screenshots/case-detail.png) |

| Three-bureau reports | Approvals |
| --- | --- |
| ![Reports](./brand/screenshots/reports.png) | ![Approvals](./brand/screenshots/approvals.png) |

| Freeze center | Mailroom | Settings · OpenRouter |
| --- | --- | --- |
| ![Freezes](./brand/screenshots/freezes.png) | ![Mailroom](./brand/screenshots/mailroom.png) | ![Settings](./brand/screenshots/settings.png) |

| Sign in | Mobile |
| --- | --- |
| ![Sign in](./brand/screenshots/login.png) | ![Mobile](./brand/screenshots/mobile-dashboard.png) |

Screenshots are the current light-theme product, captured from a freshly seeded demo workspace. The same set (desktop 1440×900 and mobile 375×812) lives in [`brand/screenshots`](./brand/screenshots).

## Stack

- **Nuxt 4.6** (Vue 3.5, Nitro `node-server` preset, TypeScript strict) — single process serving UI, API, SSE and the background job worker.
- **Tailwind CSS 4** with a token-driven, light-first design system (`brand/tokens/creditos.tokens.json` → `app/assets/css/main.css`), dark theme as a first-class mirror, Manrope + Inter + JetBrains Mono self-hosted via Fontsource.
- **PostgreSQL 14+** via Drizzle ORM. The connection string is pasted on first launch (or set as `DATABASE_URL` for local dev), saved encrypted in the data directory, and editable in Settings. Migrations run on connect (`AUTO_MIGRATE=true`) or via `pnpm db:migrate`.
- **OpenRouter** for live model calls with a searchable model catalogue, per-role model selection, structured outputs, provider routing preferences and a per-run cost cap.
- **pdf-lib / unpdf** for letter rendering and text extraction, **file-type** for magic-byte validation.
- **vitest** for unit and scenario tests, **ESLint** (`@nuxt/eslint`) and `vue-tsc` for static checks.

Exact versions are pinned in `package.json` / `pnpm-lock.yaml` (Nuxt `4.6.3`, Vue `3.5.x`, Drizzle ORM `0.45.x`, Tailwind `4.x`).

## Quick start (local)

Requirements: Node 22+, pnpm 10 (`corepack enable`), and a reachable PostgreSQL 14+ database.

```bash
git clone https://github.com/zodyking/CreditOS.git
cd CreditOS
pnpm install
cp .env.example .env
# edit .env: NUXT_SESSION_PASSWORD, APP_ENCRYPTION_KEY
# DATABASE_URL is optional — leave it empty to paste the connection string in the browser
pnpm dev
```

Open <http://localhost:8176>. If `DATABASE_URL` is empty, the first page asks for a PostgreSQL connection string, connects, and saves it. In demo mode (`APP_MODE=demo`, `DEMO_SEED=true`) the database is migrated and seeded on that first connection and you can sign in with:

```
demo@creditos.local / creditos-demo
```

Outside demo mode the first visit shows an owner-setup screen instead.

### Windows 11 (PowerShell)

```powershell
git clone https://github.com/zodyking/CreditOS.git
Set-Location CreditOS
corepack enable
pnpm install
Copy-Item .env.example .env
notepad .env          # set DATABASE_URL, NUXT_SESSION_PASSWORD, APP_ENCRYPTION_KEY
pnpm dev              # development server on http://localhost:8176
```

Production on Windows:

```powershell
pnpm build
$env:NODE_ENV = "production"
pnpm start              # http://localhost:8176
```

Run these from the project folder (any folder you own). Nothing depends on launching from `C:\Windows\System32`.

Generate secrets on any platform with Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # NUXT_SESSION_PASSWORD
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # APP_ENCRYPTION_KEY
```

## Publish with Dokploy

The Environment tab only needs two values. The database connection string is entered in the browser on first launch and saved encrypted on the volume Compose creates (`creditos-data`, mounted at `/data`). You do not attach a volume yourself, and you do not put `DATABASE_URL` in the environment.

The app listens on port **8176** (host and container). That stays clear of Dokploy's panel on port 3000. The domain targets container port **8176**.

### 1. Create the database

In the same Dokploy project, **Create Service → Database → PostgreSQL** and deploy it. Copy its **internal** connection string (the host is the database service name, not `localhost`).

### 2. Publish CreditOS

1. **Create Service → Compose**. Source: **GitHub**, this repo, branch `main`, compose path `docker-compose.yml`.
2. **Environment** tab — these two lines are the whole environment. Generate them with the Node commands in [Quick start](#quick-start-local).

   ```bash
   NUXT_SESSION_PASSWORD=replace-with-48-bytes-base64
   APP_ENCRYPTION_KEY=replace-with-32-bytes-base64
   ```

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `NUXT_SESSION_PASSWORD` | yes | 32+ characters. Signs the session cookie. Changing it signs everyone out. |
   | `APP_ENCRYPTION_KEY` | yes | 32-byte key. Encrypts the saved database URL and provider secrets. Rotating it means pasting the connection string again. |
   | `APP_MODE` | no | `demo` (default) · `test` · `live`. |
   | `DEMO_SEED` | no | `true` loads the synthetic workspace the first time a database connects and is empty. |

3. **Domains → Add domain**. Service `creditos`, container port **8176**, HTTPS with Let's Encrypt. Point DNS at the server before this step.
4. **Deploy.** Compose creates the `creditos-data` volume during this deploy.

### 3. Paste the connection string

1. Open the domain. The first page is **Connect your database**.
2. Paste the internal Postgres URL from step 1 and choose **Connect and save**. CreditOS checks the connection, runs migrations, and stores the string encrypted in `/data`. The password is not shown again.
3. In demo mode, sign in with `demo@creditos.local` / `creditos-demo`. Otherwise create the owner account.
4. To point at a different database later, open **Settings → Database**, paste a new string, and choose **Test and save**. That switches over immediately.

A later push redeploys the container and keeps the volume, including the saved connection.

To leave the demo, set `APP_MODE=live` and `DEMO_SEED=false` in the Environment tab and deploy again. Then follow [`SECURITY.md`](./SECURITY.md) and [`INTEGRATIONS.md`](./INTEGRATIONS.md) before using a live mail provider.

### Plain Docker (no Dokploy)

```bash
# .env must define NUXT_SESSION_PASSWORD and APP_ENCRYPTION_KEY
docker compose up -d --build
# http://localhost:8176   then paste a Postgres URL on the first page
```

## Operating modes

| Mode | Council | Outbound mail | Data |
| --- | --- | --- | --- |
| `demo` | Deterministic simulator, labelled **Demo** | Sandbox only | Synthetic seed allowed |
| `test` | Live OpenRouter calls (if a key is stored and live runs are enabled) | Forced to sandbox even if a live provider is configured | Live imports allowed |
| `live` | Live OpenRouter calls | Configured provider (e.g. PostGrid) with explicit approval and consent | Live |

Every snapshot, council run, mail order and inbound item carries its own `mode` label, and the UI marks Demo/Sandbox/AI-generated content in Orchid so it can never be mistaken for a live result.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server with HMR |
| `pnpm build` / `pnpm start` | Production build / serve on port 8176 |
| `pnpm db:migrate` | Apply SQL migrations (also automatic on boot when `AUTO_MIGRATE=true`) |
| `pnpm db:seed` | Seed the synthetic tri-bureau demo dataset |
| `pnpm db:reset` | Drop and recreate the schema (destructive) |
| `pnpm test` | vitest suite (state machines, detection, rules, council gates, mailroom, uploads, webhooks) |
| `pnpm lint` / `pnpm typecheck` | ESLint / `vue-tsc` |

## Repository layout

```
app/            Nuxt app: pages, layouts, components, composables, design tokens (CSS)
server/api      REST + SSE endpoints (Nitro)
server/domains  reports · monitoring · cases · rules · council · correspondence · mailroom · freezes · documents · jobs · settings · seed
server/db       Drizzle schema, client, SQL migrations
shared/         Constants and state machines shared by client and server
brand/          Brand kit: logos, social cards, design tokens, screenshots, brand README
tests/          vitest suites
scripts/        migrate / seed / reset CLIs
```

## Documentation

- [`INTEGRATIONS.md`](./INTEGRATIONS.md) — providers, consent, exactly which operations are implemented, and how to switch Demo/Test/Live.
- [`SECURITY.md`](./SECURITY.md) — security model, limitations and the production launch checklist.
- [`BUILD_STATUS.md`](./BUILD_STATUS.md) — every requirement marked Implemented / Simulated / Blocked on provider approval / Not implemented.
- [`brand/README.md`](./brand/README.md) — the brand kit.

## License

Copyright © zodyking. All rights reserved unless a license file is added to this repository.
