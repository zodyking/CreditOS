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
- **PostgreSQL 14+** via Drizzle ORM. The database is always external; migrations live in `server/db/migrations` and run on boot (`AUTO_MIGRATE=true`) or via `pnpm db:migrate`.
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

CreditOS is one container: the UI, the API, server-sent events and the job worker. PostgreSQL is always a separate database. The image is the repo [`Dockerfile`](./Dockerfile) (Node 22 Alpine, non-root user, health check on `GET /api/health`). [`docker-compose.yml`](./docker-compose.yml) is the file Dokploy should build.

Dokploy's panel already listens on **host port 3000**. CreditOS listens on **container port 3000** and the compose file publishes that as **host port 3010** (`CREDITOS_HOST_PORT`) so a deploy does not take the panel's port. Public HTTPS goes through Dokploy's Domains tab to container port **3000**, not 3010.

### 1. Prepare the server

1. Install Dokploy on the VPS ([installation](https://docs.dokploy.com/docs/core/installation)). Leave ports 80 and 443 open for Traefik. Do not put another process on host port 3000.
2. At your DNS provider, create an A record (for example `creditos.example.com`) pointing at the server **before** you request a certificate. If the record is added after the domain, Let's Encrypt will not issue and you will have to recreate the domain.

### 2. Connect GitHub

1. In Dokploy open **Git** and choose **GitHub**.
2. **Create GitHub App**, give it a unique name, then **Install**.
3. Grant the app this repository (`zodyking/CreditOS`, or your fork).

Pushes to the branch you select in the service redeploy automatically. Pushes to other branches do not.

### 3. Create the project and Postgres

1. **Projects → Create project**.
2. **Create Service → Database → PostgreSQL**. Set a database name, user and password, then deploy the database.
3. Copy the **internal** connection URL from that database's connection panel. The host is the Dokploy service name on the internal Docker network. Do not use `localhost`, `127.0.0.1`, or the public IP — the app container cannot reach those.

### 4. Publish the app (Compose)

1. In the same project, **Create Service → Compose**.
2. Source: **GitHub**. Repository: this repo. Branch: `main`. Compose path: `docker-compose.yml`.
3. Open **Environment** and paste the variables below. Dokploy writes them to a `.env` file next to the compose file. They are not injected on their own; `docker-compose.yml` already references each one as `${VAR}`, which is what Compose reads from that file.

   ```bash
   DATABASE_URL=postgresql://USER:PASSWORD@dokploy-db-service:5432/DBNAME
   NUXT_SESSION_PASSWORD=replace-with-48-bytes-base64
   APP_ENCRYPTION_KEY=replace-with-32-bytes-base64
   APP_MODE=demo
   DEMO_SEED=true
   AUTO_MIGRATE=true
   OPENROUTER_API_KEY=
   MAIL_OUTBOUND_PROVIDER=sandbox
   ```

   Generate the two secrets on any machine with Node (same commands as in Quick start):

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # NUXT_SESSION_PASSWORD
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # APP_ENCRYPTION_KEY
   ```

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `DATABASE_URL` | yes | Internal Postgres URL from step 3. `NUXT_DATABASE_URL` is also accepted. |
   | `NUXT_SESSION_PASSWORD` | yes | 32+ characters. Signs and encrypts the session cookie. Changing it signs everyone out. |
   | `APP_ENCRYPTION_KEY` | yes | 32-byte key (base64 or hex) for AES-256-GCM secrets. Rotating it makes stored provider keys unreadable; enter them again in Settings. |
   | `APP_MODE` | no | `demo` (default) · `test` · `live`. See [Operating modes](#operating-modes). |
   | `DEMO_SEED` | no | `true` loads the synthetic workspace when the database is empty. Set `false` before real data. |
   | `AUTO_MIGRATE` | no | `true` applies `server/db/migrations` on boot. |
   | `OPENROUTER_API_KEY` | no | Optional. You can also store the key encrypted from Settings → AI council. |
   | `MAIL_OUTBOUND_PROVIDER`, `POSTGRID_API_KEY`, `MAIL_WEBHOOK_SECRET` | no | Outbound mail. Stays `sandbox` until you opt into a provider. |

4. Leave the compose file's named volume `creditos-data` mounted at `/data`. That is where uploads and rendered PDFs live, and it is the kind of volume Dokploy can back up. Do not replace it with an absolute host path such as `/opt/data:/data` — Dokploy cleans those on redeploy. If you need a bind mount, use Dokploy's `../files/...` path.
5. Do not add Traefik labels, a `container_name`, or a `version:` key. Dokploy attaches routing itself when you add a domain.

#### Alternative: Application service (Dockerfile)

Use this if you prefer an Application over Compose.

1. **Create Service → Application**. Provider GitHub, this repo, branch `main`, build path `/`.
2. Build type **Dockerfile**. Dockerfile path `Dockerfile`, Docker context `.`, build stage `runtime`. Do not use Nixpacks or Railpack; this repo's supported build is the Dockerfile.
3. **Environment**: same variables as the table above. On an Application service Dokploy injects them into the container directly, so no `${VAR}` wiring is required.
4. **Advanced → Volumes**: add a volume with mount path `/data` (the image default for `DATA_DIR`).
5. The container listens on port 3000. Do not map host port 3000.

### 5. Attach the domain

1. Open the service's **Domains** tab → **Add domain**.
2. Host: `creditos.example.com`.
3. Compose service name: `creditos`. Container port: **3000** (the process port, not the published host port 3010).
4. HTTPS on, certificate **Let's Encrypt**.
5. Save. For an Application service the domain is picked up without a rebuild. A generated `traefik.me` hostname is HTTP-only and is enough for a first smoke test.

### 6. Deploy and check

1. **General → Deploy**. Watch the **Deployments** log until the build succeeds.
2. Confirm readiness:

   ```bash
   curl -fsS https://creditos.example.com/api/health
   ```

   `200` means the process is up, Postgres answered, and migrations ran.
3. Open the domain. With `APP_MODE=demo` and `DEMO_SEED=true`, sign in with `demo@creditos.local` / `creditos-demo`. The first boot migrates and seeds; later boots keep the same database.
4. The next push to the selected branch builds and replaces the container. The `/data` volume and the Postgres service survive that.

### 7. Switch off the demo

When the workspace is yours and not the synthetic file:

1. Set `APP_MODE=live` (or `test` while you rehearse) and `DEMO_SEED=false`, then redeploy.
2. Put the OpenRouter key in Settings → AI council, or in `OPENROUTER_API_KEY`.
3. Walk the production checklist in [`SECURITY.md`](./SECURITY.md) and the provider matrix in [`INTEGRATIONS.md`](./INTEGRATIONS.md) before pointing mail at a live provider.

### Plain Docker (no Dokploy)

```bash
# DATABASE_URL, NUXT_SESSION_PASSWORD and APP_ENCRYPTION_KEY must be set
docker compose up -d --build
# app on http://localhost:3010  (set CREDITOS_HOST_PORT=3000 to use port 3000 instead)
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
