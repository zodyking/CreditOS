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
- **PostgreSQL 16** via Drizzle ORM. The Dokploy compose file starts it and stores it on a volume Compose creates. Local `pnpm dev` can point `DATABASE_URL` at any Postgres 14+. Migrations live in `server/db/migrations` and run on boot (`AUTO_MIGRATE=true`) or via `pnpm db:migrate`.
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
# edit .env: DATABASE_URL, NUXT_SESSION_PASSWORD, APP_ENCRYPTION_KEY
pnpm dev
```

Open <http://localhost:3000>. In demo mode (`APP_MODE=demo`, `DEMO_SEED=true`) the database is migrated and seeded on first boot and you can sign in with:

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
pnpm dev              # development server on http://localhost:3000
```

Production on Windows:

```powershell
pnpm build
$env:NODE_ENV = "production"
node .output\server\index.mjs
```

Run these from the project folder (any folder you own). Nothing depends on launching from `C:\Windows\System32`.

Generate secrets on any platform with Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # NUXT_SESSION_PASSWORD
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # APP_ENCRYPTION_KEY
```

## Publish with Dokploy

Use a **Compose** service. [`docker-compose.yml`](./docker-compose.yml) starts CreditOS and PostgreSQL together. You type the database name, user and password in Dokploy's **Environment** tab; you do not create a database service and you do not attach a volume. The first deploy creates both volumes and keeps them across later deploys:

| Volume | What it holds |
| --- | --- |
| `creditos-pg` | The Postgres data directory |
| `creditos-data` | Uploads and rendered PDFs (`/data`) |

Dokploy's panel already listens on host port 3000. The app listens on container port 3000, which the compose file publishes on host port 3010 so the two do not clash. The domain you add below targets container port **3000**.

### 1. Connect the repository

1. Install Dokploy ([installation](https://docs.dokploy.com/docs/core/installation)). Leave ports 80 and 443 open.
2. **Git → GitHub → Create GitHub App**, then **Install** and grant this repository.
3. Create an A record for the hostname you want (for example `creditos.example.com`) pointing at the server before you request a certificate.

### 2. Create the Compose service

1. **Projects → Create project → Create Service → Compose**.
2. Source: **GitHub**. Repository: this repo. Branch: `main`. Compose path: `docker-compose.yml`.
3. Open the **Environment** tab and paste the fields below. This is the only place database and secret values are entered. Generate the two secrets with the Node commands in [Quick start](#quick-start-local); use a hex password so it stays a single token.

   ```bash
   POSTGRES_USER=creditos
   POSTGRES_PASSWORD=replace-with-openssl-rand-hex-24
   POSTGRES_DB=creditos
   NUXT_SESSION_PASSWORD=replace-with-48-bytes-base64
   APP_ENCRYPTION_KEY=replace-with-32-bytes-base64
   ```

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `POSTGRES_PASSWORD` | yes | Password for the database this stack creates. |
   | `POSTGRES_USER` | no | Defaults to `creditos`. |
   | `POSTGRES_DB` | no | Defaults to `creditos`. |
   | `NUXT_SESSION_PASSWORD` | yes | 32+ characters. Signs the session cookie. Changing it signs everyone out. |
   | `APP_ENCRYPTION_KEY` | yes | 32-byte key (base64 or hex). Rotating it makes stored provider keys unreadable. |
   | `APP_MODE` | no | `demo` (default) · `test` · `live`. |
   | `DEMO_SEED` | no | `true` loads the synthetic workspace when the database is empty. |
   | `OPENROUTER_API_KEY` | no | Optional here. Settings → AI council can store it encrypted instead. |
   | `POSTGRES_HOST` | no | Defaults to the Postgres service in this compose file. Set it only to point at a database you already created in Dokploy. |

   Do not add a volume, a `container_name`, Traefik labels, or a `version:` key. Dokploy saves the Environment tab to `.env`, and the compose file already reads those names.

### 3. Add the domain and deploy

1. **Domains → Add domain**. Host: `creditos.example.com`. Service: `creditos`. Container port: **3000**. HTTPS on, certificate **Let's Encrypt**.
2. **General → Deploy**. The build log is on the **Deployments** tab. Compose creates `creditos-pg` and `creditos-data` during this deploy.
3. Check `https://creditos.example.com/api/health`. `200` means the process is up, Postgres answered, and migrations ran.
4. Sign in with `demo@creditos.local` / `creditos-demo` while `APP_MODE=demo`.

A push to the selected branch redeploys the containers and leaves both volumes in place.

To leave the demo, set `APP_MODE=live` and `DEMO_SEED=false` in the Environment tab and deploy again. Then follow [`SECURITY.md`](./SECURITY.md) and [`INTEGRATIONS.md`](./INTEGRATIONS.md) before using a live mail provider.

### Plain Docker (no Dokploy)

```bash
# .env must define POSTGRES_PASSWORD, NUXT_SESSION_PASSWORD and APP_ENCRYPTION_KEY
docker compose up -d --build
# http://localhost:3010   (CREDITOS_HOST_PORT=3000 to publish on port 3000 instead)
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
| `pnpm build` / `pnpm start` | Production build / run `.output/server/index.mjs` |
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
