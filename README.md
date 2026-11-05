<p align="center">
  <img src="./brand/social/readme-banner.svg" alt="CreditOS — credit intelligence, under your control" width="100%" />
</p>

<p align="center">
  <strong>CreditOS</strong> is a self-hosted credit intelligence workspace.<br />
  Compare the three bureaus, keep every claim tied to evidence, and send a letter only after you approve it.
</p>

<p align="center">
  <img alt="Nuxt 4" src="https://img.shields.io/badge/Nuxt-4.6-00DC82?logo=nuxt&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white" />
  <img alt="OpenRouter" src="https://img.shields.io/badge/AI-OpenRouter-9B6DFF" />
  <img alt="Dokploy ready" src="https://img.shields.io/badge/Deploy-Dokploy-0B1220" />
</p>

<p align="center">
  <img src="./brand/screenshots/dashboard.png" alt="CreditOS dashboard" width="680" />
  <img src="./brand/screenshots/mobile-dashboard.png" alt="CreditOS on a phone" width="220" />
</p>

CreditOS compares Equifax, Experian, and TransUnion reports, runs an evidence-backed rules check, and convenes a council before it drafts anything. Demo mode uses a simulator and synthetic data. Test mode keeps mail in a sandbox. Live mode can send approved letters through a real provider. Outcomes are never guaranteed, and this is not legal advice.

## Run it

Node 22 and pnpm 10. PostgreSQL 14 or newer.

```bash
git clone https://github.com/zodyking/CreditOS.git
cd CreditOS
pnpm install
cp .env.example .env
pnpm dev
```

Open <http://localhost:8176>. The first page asks you to pick **Demo**, **Test**, or **Live**, then paste a Postgres connection string if one is not already configured. Demo signs in as `demo@creditos.local` / `creditos-demo`. Test and Live ask you to create the owner account. Change the mode later under **Settings → System**.

Docker, including Dokploy:

```bash
docker compose up -d --build
```

The container listens on port **8176**. In Dokploy, create a Compose service from this repo (`main`, `docker-compose.yml`), point the domain at container port **8176**, and leave the Environment tab empty. The first start generates the session and encryption secrets on the `creditos-data` volume. Create a Postgres database in Dokploy, then paste its internal connection string into the first page.

More detail lives in [`INTEGRATIONS.md`](./INTEGRATIONS.md), [`SECURITY.md`](./SECURITY.md), and [`BUILD_STATUS.md`](./BUILD_STATUS.md).

## License

Copyright © zodyking. All rights reserved unless a license file is added to this repository.
