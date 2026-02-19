# Monorepo Structure Guide

## Overview

JejakHarga uses a **pnpm-based monorepo** with **Turborepo** for build orchestration. This structure supports multiple Cloudflare Workers, shared packages, and Svelte SPA frontends deployed to Cloudflare Pages.

---

## Directory Structure

```
jejakharga/
├── docs/                          # Project documentation
├── packages/
│   ├── shared/                    # Shared code across all workers
│   │   ├── src/
│   │   │   ├── db/               # D1 queries, schema definitions
│   │   │   ├── types/            # TypeScript interfaces
│   │   │   ├── utils/            # Common utilities
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── adapters/                  # Platform-specific scrapers
│   │   ├── src/
│   │   │   ├── tokopedia.ts
│   │   │   ├── shopee.ts
│   │   │   ├── blibli.ts
│   │   │   ├── lazada.ts
│   │   │   ├── tiktokshop.ts
│   │   │   ├── index.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ingestion-api/            # Ingestion API Worker
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── scraper/                  # Daily Scrape Workflow + Browser Rendering
│   │   ├── src/
│   │   │   ├── workflows/
│   │   │   │   └── price-refresh.ts
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── redirector/               # Referral Link Redirector Worker
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── health-monitor/           # Health Monitor + Price Alerts
│   │   ├── src/
│   │   │   ├── workflows/
│   │   │   │   └── health-check.ts
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── curation-dashboard/       # Internal admin UI (Svelte SPA)
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   ├── routes/
│   │   │   └── app.html
│   │   ├── static/
│   │   ├── package.json
│   │   ├── svelte.config.js
│   │   └── tsconfig.json
│   │
│   └── storefront/               # Public-facing price comparison UI (Svelte SPA)
│       ├── src/
│       │   ├── lib/
│       │   ├── routes/
│       │   └── app.html
│       ├── static/
│       ├── package.json
│       ├── svelte.config.js
│       └── tsconfig.json
│
├── package.json                  # Root package.json with workspaces
├── pnpm-workspace.yaml           # pnpm workspace config
├── turbo.json                    # Turborepo config
├── tsconfig.json                 # Base TypeScript config
└── .gitignore
```

---

## Package Details

### `packages/shared`

Shared utilities, types, and database logic used across all Workers.

**Dependencies:**
- None (pure TypeScript)

**Exports:**
- `@jejakharga/shared/db` — D1 query builders, schema constants
- `@jejakharga/shared/types` — TypeScript interfaces for canonical_products, platform_listings, price_snapshots
- `@jejakharga/shared/utils` — Helper functions (date formatting, price validation, etc.)

**Usage in other packages:**
```ts
import { CanonicalProduct, Listing } from '@jejakharga/shared/types'
import { getLatestPrices } from '@jejakharga/shared/db'
import { formatPriceIDR, validatePrice } from '@jejakharga/shared/utils'
```

---

### `packages/adapters`

Platform-specific scraping adapters. Each adapter exports a consistent interface.

**Dependencies:**
- `@jejakharga/shared/types`

**Exports:**
- `@jejakharga/adapters` — Platform adapter registry and types

**Interface:**
```ts
interface PlatformAdapter {
  extract(page: Page, listing: Listing): Promise<ScrapedData>
}

interface ScrapedData {
  price: number | null
  original_price: number | null
  stock_status: 'available' | 'limited' | 'out_of_stock' | null
  seller_name: string | null
  valid: boolean
  flag_reason?: string
  raw_debug?: string
}
```

---

### `packages/ingestion-api`

Authenticated API Worker for adding new products and listings via the Curation Dashboard.

**Cloudflare Bindings:**
- `DB` — D1 database
- `PRICE_REFRESH_WORKFLOW` — Workflow binding for triggering first-scrape

**Endpoints:**
```
POST /api/products          → Create canonical product
POST /api/listings          → Add a new platform listing
GET  /api/listings/:id      → Get listing details
PATCH /api/listings/:id     → Update listing
POST /api/listings/:id/scrape  → Trigger manual re-scrape
```

**Dependencies:**
- `@jejakharga/shared`
- `@jejakharga/adapters`

---

### `packages/scraper`

Daily price refresh Workflow with Browser Rendering. Orchestrates scraping across all active listings.

**Cloudflare Bindings:**
- `DB` — D1 database
- `BROWSER` — Browser Rendering API

**Triggers:**
- Cron: `0 19 * * *` (2:00 AM WIB)
- Manual: via Ingestion API for first-scrape

**Dependencies:**
- `@jejakharga/shared`
- `@jejakharga/adapters`

---

### `packages/redirector`

Short URL redirector for affiliate links at `go.yourdomain.com`.

**Cloudflare Bindings:**
- `DB` — D1 database

**Routes:**
```
GET /{short_code}  → 302 redirect to affiliate URL
GET /              → 301 redirect to main storefront
```

**Dependencies:**
- `@jejakharga/shared`

---

### `packages/health-monitor`

Post-scrape health checks and price drop alerts.

**Cloudflare Bindings:**
- `DB` — D1 database

**Triggers:**
- Cron: `30 19 * * *` (2:30 AM WIB)

**Checks:**
1. Listings not scraped today
2. High volume of flagged snapshots
3. Platform-specific failure rates
4. Price drops > 15%

**Dependencies:**
- `@jejakharga/shared`

---

### `packages/curation-dashboard`

Internal admin UI for managing products, sellers, and listings. Built with Svelte and deployed to Cloudflare Pages.

**Tech Stack:**
- Svelte (SPA mode)
- TypeScript
- Tailwind CSS (recommended)

**Routes:**
```
/                    → Dashboard overview
/products            → Product list
/products/new        → Add new product
/products/:id        → Product detail
/listings            → Listing list
/listings/:id        → Listing detail
/flagged             → Flagged snapshots review
```

**Dependencies:**
- `@jejakharga/shared/types` (for type definitions only)

**Deployment:**
- Cloudflare Pages (SPA mode)
- Environment variables for API endpoint

---

### `packages/storefront`

Public-facing price comparison and tracking UI. Built with Svelte and deployed to Cloudflare Pages.

**Tech Stack:**
- Svelte (SPA mode)
- TypeScript
- Tailwind CSS (recommended)

**Routes:**
```
/                    → Homepage with featured products
/products            → Product catalog
/products/:slug      → Product detail with price comparison
/categories/:name    → Category filter
/search              → Search results
```

**Dependencies:**
- `@jejakharga/shared/types` (for type definitions only)

**Deployment:**
- Cloudflare Pages (SPA mode)
- Environment variables for API endpoint

---

## Tooling Configuration

### Root `package.json`

```json
{
  "name": "jejakharga",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,md,svelte}\""
  },
  "devDependencies": {
    "prettier": "^3.2.0",
    "prettier-plugin-svelte": "^3.2.0",
    "turbo": "^2.0.0",
    "typescript": "^5.3.0"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20"
  }
}
```

---

### `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
```

---

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".svelte-kit/**", ".output/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

---

### Base `tsconfig.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

## Development Workflow

### Initial Setup

```bash
# Install pnpm if not already
npm install -g pnpm

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development Mode

```bash
# Run all packages in dev mode
pnpm dev

# Run specific package
pnpm --filter @jejakharga/scraper dev
pnpm --filter @jejakharga/storefront dev
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @jejakharga/shared build
```

### Linting

```bash
pnpm lint
```

---

## Deployment

### Cloudflare Workers

Each Worker package has its own `wrangler.toml` and can be deployed independently:

```bash
# Deploy ingestion API
pnpm --filter @jejakharga/ingestion-api deploy

# Deploy scraper workflow
pnpm --filter @jejakharga/scraper deploy

# Deploy redirector
pnpm --filter @jejakharga/redirector deploy

# Deploy health monitor
pnpm --filter @jejakharga/health-monitor deploy
```

### Cloudflare Pages (Svelte SPAs)

The frontends are built as static SPAs and deployed to Cloudflare Pages:

```bash
# Build storefront
pnpm --filter @jejakharga/storefront build

# Build curation dashboard
pnpm --filter @jejakharga/curation-dashboard build
```

Deployment can be automated via GitHub Actions or Cloudflare Pages' Git integration.

---

## D1 Database Migrations

Database schema migrations should be managed centrally. Recommended approach:

1. Create a `migrations/` folder at root level
2. Use Wrangler to apply migrations:
   ```bash
   wrangler d1 migrations apply price-tracker-db
   ```

Alternatively, keep migrations in `packages/shared/db/migrations/` and document the application process.

---

## Environment Variables & Secrets

### Workers (set via `wrangler secret put`)

| Secret | Used By |
|--------|---------|
| `ADMIN_API_KEY` | ingestion-api |
| `TELEGRAM_BOT_TOKEN` | health-monitor |
| `TELEGRAM_CHAT_ID` | health-monitor |

### Frontends (set via Cloudflare Pages dashboard)

| Variable | Used By |
|----------|---------|
| `PUBLIC_API_URL` | storefront, curation-dashboard |

---

## Package Dependency Graph

```
                    ┌─────────────┐
                    │   shared    │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  adapters   │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ ingestion  │  │  scraper   │  │  health    │
    │    -api    │  │            │  │  -monitor  │
    └────────────┘  └────────────┘  └────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ redirector  │
                    └─────────────┘

    ┌────────────┐                    ┌────────────┐
    │  curation  │                    │ storefront │
    │  dashboard │                    │            │
    └────────────┘                    └────────────┘
         │                                  │
         └──────────────┬───────────────────┘
                        │
                        ▼
                 ┌─────────────┐
                 │shared/types │
                 └─────────────┘
```

---

## Notes

- **Shared types only**: Frontend packages should only import `@jejakharga/shared/types` to avoid bundling server-side code
- **Independent deployments**: Each Worker/SPA can be deployed independently without affecting others
- **Versioning**: Internal packages use `workspace:*` protocol, no need to publish to npm
- **CI/CD**: Turborepo's caching speeds up CI pipelines significantly