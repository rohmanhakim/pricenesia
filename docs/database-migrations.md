# Database Initialization & Migration Guide

This guide covers initializing the D1 database, running migrations, and managing schema changes for the Pricenesia project.

---

## Prerequisites

- **Node.js 20+**
- **Wrangler CLI** (install via pnpm in project):
  ```bash
  pnpm add -g wrangler
  ```
  Or use the project-local version via `pnpm wrangler`
- **Cloudflare authentication**:
  ```bash
  wrangler login
  ```

---

## Quick Start

### One-Time Database Initialization

```bash
# 1. Create the D1 database (only needed once)
wrangler d1 create pricenesia-db

# 2. Save the database_id from the output and update wrangler.toml files

# 3. Apply the initial migration
wrangler d1 migrations apply pricenesia-db --remote
```

### Local Development Setup

```bash
# Apply migrations to local D1 database
wrangler d1 migrations apply pricenesia-db --local
```

---

## Database Configuration

The database configuration is defined in:

| File | Purpose |
|------|---------|
| `wrangler.toml` (root) | Main database binding for migrations |
| `packages/ingestion-api/wrangler.toml` | Worker-specific binding |

Both files must have the same `database_id`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "pricenesia-db"
database_id = "04c250e7-2957-4acd-85fd-6120de671fb1"
```

---

## Migration Workflow

### Project Structure

```
pricenesia/
├── wrangler.toml          # Root config for migrations
├── migrations/
│   └── 0001_initial_schema.sql
└── packages/
    └── ingestion-api/
        └── wrangler.toml  # Worker binding
```

### Running Migrations

Migrations must be run from the **project root** directory.

```bash
# Apply to remote (production) database
wrangler d1 migrations apply pricenesia-db --remote

# Apply to local development database
wrangler d1 migrations apply pricenesia-db --local
```

### Migration Execution Order

Wrangler automatically:
1. Checks the `migrations/` folder for `.sql` files
2. Tracks which migrations have been applied (stored in `d1_migrations` table)
3. Applies only pending migrations in alphabetical order

---

## Creating New Migrations

### Step 1: Create Migration File

```bash
wrangler d1 migration create pricenesia-db <migration_name>
```

Example:
```bash
wrangler d1 migration create pricenesia-db add_user_preferences
# Creates: migrations/0002_add_user_preferences.sql
```

### Step 2: Write Migration SQL

Edit the generated file:

```sql
-- migrations/0002_add_user_preferences.sql

CREATE TABLE IF NOT EXISTS user_preferences (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  product_id    TEXT NOT NULL REFERENCES canonical_products(id),
  target_price  INTEGER,
  notify_below  INTEGER DEFAULT 1,
  notify_oos    INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_user_prefs_user ON user_preferences(user_id);
CREATE INDEX idx_user_prefs_product ON user_preferences(product_id);
```

### Step 3: Test Locally First

```bash
# Apply to local database
wrangler d1 migrations apply pricenesia-db --local

# Verify the changes
wrangler d1 execute pricenesia-db --local --command "PRAGMA table_info(user_preferences);"
```

### Step 4: Apply to Production

```bash
wrangler d1 migrations apply pricenesia-db --remote
```

---

## Migration Naming Convention

Use descriptive names with the pattern: `<category>_<action>_<details>`

| Pattern | Examples |
|---------|----------|
| `add_<table>` | `add_user_preferences`, `add_alert_logs` |
| `alter_<table>_<column>` | `alter_listings_add_seller_rating` |
| `create_<index>` | `create_index_snapshots_price` |
| `drop_<table>` | `drop_deprecated_cache` |
| `seed_<data>` | `seed_initial_products` |

---

## Useful Commands Reference

### Database Info

```bash
# View database details
wrangler d1 info pricenesia-db

# List applied migrations
wrangler d1 migrations list pricenesia-db

# List tables
wrangler d1 execute pricenesia-db --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table';"
```

### Execute SQL

```bash
# Single command
wrangler d1 execute pricenesia-db --remote --command "SELECT COUNT(*) FROM price_snapshots;"

# From file
wrangler d1 execute pricenesia-db --remote --file ./queries/analyze.sql

# With output formatting
wrangler d1 execute pricenesia-db --remote --command "SELECT * FROM canonical_products LIMIT 5;" --json
```

### Export & Backup

```bash
# Export entire database
wrangler d1 export pricenesia-db --output backup.sql

# Export with specific timestamp
wrangler d1 export pricenesia-db --output backup-$(date +%Y%m%d-%H%M%S).sql
```

### Time Travel (Point-in-Time Recovery)

```bash
# View available restore points
wrangler d1 time-travel info pricenesia-db

# Restore to specific timestamp
wrangler d1 time-travel restore pricenesia-db --timestamp "2026-02-24T10:00:00Z"
```

---

## Environment-Specific Operations

### Remote (Production)

All production commands use `--remote`:
```bash
wrangler d1 migrations apply pricenesia-db --remote
wrangler d1 execute pricenesia-db --remote --command "..."
```

### Local (Development)

Local database is stored in `.wrangler/state/`:
```bash
wrangler d1 migrations apply pricenesia-db --local
wrangler d1 execute pricenesia-db --local --command "..."
```

#### Reset Local Database

```bash
# Remove local database
rm -rf .wrangler/state

# Re-apply migrations
wrangler d1 migrations apply pricenesia-db --local
```

---

## Common Operations

### Seed Test Data

```bash
wrangler d1 execute pricenesia-db --local --command "
INSERT INTO canonical_products (id, name, category, model_number)
VALUES 
  ('sony-ps4-slim-1tb-cuh2006', 'Sony PlayStation 4 Slim 1TB', 'gaming-console', 'CUH-2006A'),
  ('sony-ps5-digital', 'Sony PlayStation 5 Digital Edition', 'gaming-console', 'CFI-1102B');
"
```

### Add a Listing

```bash
wrangler d1 execute pricenesia-db --local --command "
INSERT INTO platform_listings (id, canonical_product_id, platform, seller_name, raw_url)
VALUES ('list-001', 'sony-ps4-slim-1tb-cuh2006', 'tokopedia', 'Sony Store Official', 'https://tokopedia.com/...');
"
```

### Record Price Snapshot

```bash
wrangler d1 execute pricenesia-db --local --command "
INSERT INTO price_snapshots (id, listing_id, price, original_price, stock_status)
VALUES ('snap-001', 'list-001', 4500000, 5000000, 'available');
"
```

---

## Troubleshooting

### "Migration already applied"

Check migration status:
```bash
wrangler d1 migrations list pricenesia-db
```

If you need to re-apply, you'll need to manually update the `d1_migrations` table or reset the database.

### "Database not found"

1. Verify the database exists:
   ```bash
   wrangler d1 list
   ```

2. If missing, create it:
   ```bash
   wrangler d1 create pricenesia-db
   ```

3. Update `database_id` in all `wrangler.toml` files

### "No migrations to apply"

The `migrations/` folder may not be found. Ensure:
- You're running from the project root
- The migration files have `.sql` extension
- Files are named with the correct prefix pattern (`0001_`, `0002_`, etc.)

### Foreign Key Issues

SQLite doesn't enforce foreign keys by default. Enable in your Worker code:

```typescript
// In your Worker entry point
export default {
  async fetch(request: Request, env: Env) {
    // Enable foreign key enforcement
    await env.DB.exec('PRAGMA foreign_keys = ON;');
    // ... rest of your code
  }
}
```

### Local Database Locked

Stop any running `wrangler dev` processes, then:
```bash
rm -rf .wrangler/state
wrangler d1 migrations apply pricenesia-db --local
```

---

## Best Practices

1. **Always test migrations locally first** before applying to production
2. **Use `IF NOT EXISTS`** in CREATE statements for idempotency
3. **Never modify applied migrations** - create new ones instead
4. **Back up before major schema changes**:
   ```bash
   wrangler d1 export pricenesia-db --output pre-migration-backup.sql
   ```
5. **Use transactions** for multi-statement migrations:
   ```sql
   BEGIN TRANSACTION;
   -- Your statements here
   COMMIT;
   ```
6. **Document breaking changes** in migration file comments
7. **Keep migrations small and focused** - one concern per migration

---

## Related Documentation

- [Database Schema](./02-database-schema.md) - Full schema documentation
- [D1 Bootstrap Guide](./d1-bootstrap-guide.md) - Initial setup reference
- [Cloudflare Reference](./cloudflare-reference.md) - Cloudflare services overview