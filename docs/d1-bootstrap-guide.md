# D1 Database Bootstrap Guide

This guide covers the initial setup and management of the Pricenesia D1 database.

## Prerequisites

- Node.js 20+
- Wrangler CLI installed globally:
  ```bash
  npm install -g wrangler
  ```
- Cloudflare account authenticated:
  ```bash
  wrangler login
  ```

---

## Step 1: Create the D1 Database

```bash
wrangler d1 create pricenesia-db
```

**Save the output!** You'll see something like:
```
✅ Successfully created DB 'pricenesia-db' in region APAC
[[d1_databases]]
binding = "DB"
database_name = "pricenesia-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` — you'll need it for all Worker configurations.

---

## Step 2: Apply the Initial Migration

```bash
wrangler d1 migrations apply pricenesia-db --remote
```

For local development, first create a local database:
```bash
wrangler d1 migrations apply pricenesia-db --local
```

---

## Step 3: Verify the Schema

List all tables:
```bash
wrangler d1 execute pricenesia-db --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Check table structure:
```bash
wrangler d1 execute pricenesia-db --command "PRAGMA table_info(canonical_products);"
```

---

## Wrangler.toml Templates

### Ingestion API Worker

```toml
# packages/ingestion-api/wrangler.toml
name = "pricenesia-ingestion-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "pricenesia-db"
database_id = "<YOUR_DATABASE_ID>"

# Workflow binding for triggering first-scrape
[[workflows]]
name = "daily-price-refresh"
binding = "PRICE_REFRESH_WORKFLOW"
class_name = "PriceRefreshWorkflow"

# Secrets (set via: wrangler secret put ADMIN_API_KEY)
# ADMIN_API_KEY
```

### Scraper Worker

```toml
# packages/scraper/wrangler.toml
name = "pricenesia-scraper"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "pricenesia-db"
database_id = "<YOUR_DATABASE_ID>"

[[browser]]
binding = "BROWSER"

[[workflows]]
name = "daily-price-refresh"
binding = "PRICE_REFRESH_WORKFLOW"
class_name = "PriceRefreshWorkflow"

[triggers]
crons = ["0 19 * * *"]  # 2:00 AM WIB (UTC+7)

# Queue for batch scraping (optional, for scaling)
# [[queues]]
# binding = "SCRAPE_QUEUE"
# queue_name = "scrape-tasks"
```

### Redirector Worker

```toml
# packages/redirector/wrangler.toml
name = "pricenesia-redirector"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "pricenesia-db"
database_id = "<YOUR_DATABASE_ID>"

# Routes for go.yourdomain.com
# routes = [
#   { pattern = "go.pricenesia.com/*", zone_name = "pricenesia.com" }
# ]
```

### Health Monitor Worker

```toml
# packages/health-monitor/wrangler.toml
name = "pricenesia-health-monitor"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "pricenesia-db"
database_id = "<YOUR_DATABASE_ID>"

[triggers]
crons = ["30 19 * * *"]  # 2:30 AM WIB (UTC+7)

# Secrets (set via: wrangler secret put)
# TELEGRAM_BOT_TOKEN
# TELEGRAM_CHAT_ID
```

---

## Useful Commands

### Execute Raw SQL

```bash
# Remote
wrangler d1 execute pricenesia-db --command "SELECT * FROM canonical_products LIMIT 5;"

# Local
wrangler d1 execute pricenesia-db --local --command "SELECT * FROM canonical_products LIMIT 5;"
```

### Execute SQL from File

```bash
wrangler d1 execute pricenesia-db --file ./migrations/0001_initial_schema.sql
```

### Create a New Migration

```bash
wrangler d1 migration create pricenesia-db add_user_tables
```

This creates `migrations/0002_add_user_tables.sql` for you to edit.

### View Database Info

```bash
wrangler d1 info pricenesia-db
```

### Time Travel (Point-in-Time Recovery)

```bash
# List available bookmarks
wrangler d1 time-travel info pricenesia-db

# Restore to a specific timestamp
wrangler d1 time-travel restore pricenesia-db --timestamp "2024-01-15T10:00:00Z"
```

---

## Local Development

### Start Local D1

Wrangler automatically creates a `.wrangler/state/` directory for local D1 data when you use `--local` flag.

```bash
# Apply migrations locally
wrangler d1 migrations apply pricenesia-db --local

# Run worker in dev mode with local D1
cd packages/ingestion-api
wrangler dev --local
```

### Seed Test Data

```bash
wrangler d1 execute pricenesia-db --local --command "
INSERT INTO canonical_products (id, name, category, model_number)
VALUES ('test-product-001', 'Test Product', 'test-category', 'TEST-001');
"
```

---

## Environment Variables

### Development
Set in `.dev.vars` file in each worker directory:
```bash
# packages/ingestion-api/.dev.vars
ADMIN_API_KEY=dev-api-key-123
```

### Production
Set via Wrangler secrets:
```bash
cd packages/ingestion-api
wrangler secret put ADMIN_API_KEY
# Enter the value when prompted
```

---

## Database Size Limits

| Plan | Max Size | Rows (approx) |
|------|----------|---------------|
| Free | 500 MB | ~500K price snapshots |
| Paid | 5 GB | ~5M price snapshots |

With ~500 listings and daily snapshots, expect ~180 rows/listing/year = ~90,000 rows/year. Well within limits.

---

## Backup Strategy

1. **Automatic backups**: D1 creates automatic snapshots (view with `wrangler d1 time-travel info`)
2. **Manual exports**: Regularly export critical data
```bash
wrangler d1 export pricenesia-db --output backup-$(date +%Y%m%d).sql
   ```
3. **Migration versioning**: All schema changes go through migration files in version control

---

## Troubleshooting

### Migration Already Applied

If you see "migration already applied", you can check status:
```bash
wrangler d1 migrations list pricenesia-db
```

### Foreign Key Constraints

SQLite doesn't enforce foreign keys by default. Enable in your Worker:
```ts
await env.DB.exec('PRAGMA foreign_keys = ON;');
```

### Local Database Issues

Reset local database:
```bash
rm -rf .wrangler/state
wrangler d1 migrations apply pricenesia-db --local
