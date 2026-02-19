# Database Schema — Cloudflare D1

## Overview

All data lives in a single Cloudflare D1 (SQLite) database. The schema is organized around three concerns: the product catalog, per-platform listings, and price history.

---

## Tables

### `canonical_products`

Your curated product catalog. One row per real-world product regardless of platform.

```sql
CREATE TABLE canonical_products (
  id          TEXT PRIMARY KEY,       -- e.g. "sony-ps4-slim-1tb-cuh2006"
  name        TEXT NOT NULL,          -- "Sony PlayStation 4 Slim 1TB"
  category    TEXT,                   -- "gaming-console"
  model_number TEXT,                  -- "CUH-2006A" — used for cross-platform validation
  image_url   TEXT,
  is_active   INTEGER DEFAULT 1,      -- soft delete
  created_at  TEXT DEFAULT (datetime('now'))
);
```

**Notes:**
- `id` is a slug you define manually at ingestion time. Make it descriptive and stable.
- `model_number` is used by the scraper to validate that a listing actually matches this product (cross-check against scraped title/description).
- `category` enables storefront filtering and grouping.

---

### `platform_listings`

One row per seller per platform per canonical product. This is the core link table.

```sql
CREATE TABLE platform_listings (
  id                  TEXT PRIMARY KEY,  -- UUID
  canonical_product_id TEXT NOT NULL REFERENCES canonical_products(id),
  platform            TEXT NOT NULL,     -- 'tokopedia' | 'shopee' | 'blibli' | 'lazada' | 'tiktokshop'
  platform_product_id TEXT,             -- platform's own product/item ID (extracted during ingestion)
  seller_id           TEXT,             -- platform's seller/shop ID
  seller_name         TEXT NOT NULL,
  seller_tier         TEXT,             -- 'official_store' | 'mall' | 'verified' | 'regular'
  raw_url             TEXT NOT NULL,    -- original product URL (no referral params)
  referral_url        TEXT,             -- current injected affiliate URL (managed by redirector)
  is_active           INTEGER DEFAULT 1,
  is_pinned_seller    INTEGER DEFAULT 1, -- explicitly trusted by you
  added_at            TEXT DEFAULT (datetime('now')),
  last_scraped_at     TEXT
);

CREATE INDEX idx_listings_canonical ON platform_listings(canonical_product_id);
CREATE INDEX idx_listings_platform ON platform_listings(platform);
```

**Notes:**
- `raw_url` never changes. `referral_url` can be updated independently when affiliate codes rotate.
- `is_pinned_seller` must be true for a listing to be included in daily scrape jobs.
- `seller_tier` is set at ingestion and can inform trust signals on the storefront.

---

### `price_snapshots`

Append-only price history. Never update or delete rows here.

```sql
CREATE TABLE price_snapshots (
  id              TEXT PRIMARY KEY,  -- UUID
  listing_id      TEXT NOT NULL REFERENCES platform_listings(id),
  price           INTEGER NOT NULL,  -- IDR, no decimals (e.g. 4500000)
  original_price  INTEGER,           -- pre-discount price if shown
  discount_pct    INTEGER,           -- calculated: ((original - price) / original * 100)
  stock_status    TEXT,              -- 'available' | 'limited' | 'out_of_stock'
  seller_name     TEXT,              -- snapshot at scrape time (seller names can change)
  scraped_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_snapshots_listing ON price_snapshots(listing_id, scraped_at DESC);
```

**Notes:**
- Store prices in **integer IDR** (Rupiah has no meaningful decimal). Rp 4.500.000 → `4500000`.
- `original_price` enables detecting real discounts vs. fake markup-then-discount tactics.
- This table grows indefinitely. For a curated catalog of ~500 listings, ~180 rows/year per listing = ~90,000 rows/year. D1 handles this comfortably.

---

### `flagged_snapshots`

Snapshots that failed sanity checks. For review and debugging.

```sql
CREATE TABLE flagged_snapshots (
  id              TEXT PRIMARY KEY,
  listing_id      TEXT NOT NULL REFERENCES platform_listings(id),
  scraped_price   INTEGER,
  last_known_price INTEGER,
  change_ratio    REAL,
  flag_reason     TEXT,   -- 'price_below_floor' | 'change_too_large' | 'parse_error' | 'zero_price'
  raw_html        TEXT,   -- optional: store snippet of scraped content for debugging
  scraped_at      TEXT DEFAULT (datetime('now')),
  reviewed        INTEGER DEFAULT 0
);
```

---

### `redirect_links`

Managed by the Referral Link Redirector. Decouples short links from actual affiliate URLs.

```sql
CREATE TABLE redirect_links (
  id              TEXT PRIMARY KEY,   -- short code, e.g. "tk-ps4-ibox"
  listing_id      TEXT REFERENCES platform_listings(id),
  target_url      TEXT NOT NULL,      -- current affiliate URL
  click_count     INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

---

## Key Queries

### Get latest price per platform for a canonical product

```sql
SELECT 
  pl.platform,
  pl.seller_name,
  pl.seller_tier,
  ps.price,
  ps.original_price,
  ps.discount_pct,
  ps.stock_status,
  ps.scraped_at,
  rl.id AS redirect_code
FROM platform_listings pl
JOIN price_snapshots ps ON ps.id = (
  SELECT id FROM price_snapshots
  WHERE listing_id = pl.id
  ORDER BY scraped_at DESC
  LIMIT 1
)
LEFT JOIN redirect_links rl ON rl.listing_id = pl.id
WHERE pl.canonical_product_id = 'sony-ps4-slim-1tb-cuh2006'
  AND pl.is_active = 1;
```

### Get price history for a listing (for chart)

```sql
SELECT price, original_price, scraped_at
FROM price_snapshots
WHERE listing_id = ?
ORDER BY scraped_at ASC;
```

### Get all listings due for scrape

```sql
SELECT pl.*, cp.model_number
FROM platform_listings pl
JOIN canonical_products cp ON cp.id = pl.canonical_product_id
WHERE pl.is_active = 1
  AND pl.is_pinned_seller = 1
  AND cp.is_active = 1
ORDER BY pl.platform, pl.last_scraped_at ASC NULLS FIRST;
```

---

## Schema Notes

- D1 is SQLite under the hood. Use `TEXT` for dates (ISO 8601), `INTEGER` for booleans (0/1) and money.
- No foreign key enforcement by default in SQLite — add `PRAGMA foreign_keys = ON` in your Worker if you want it enforced.
- Keep the `price_snapshots` table append-only. If you need to "correct" bad data, insert a corrected row rather than updating an existing one.
