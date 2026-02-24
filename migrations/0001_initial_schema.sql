-- =============================================================================
-- Pricenesia D1 Database Schema - Phase 1
-- Version: 0001
-- Description: Core tables for price tracking (without user personalization)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: canonical_products
-- Purpose: Curated product catalog. One row per real-world product.
-- Notes: ID is a manual slug (e.g., 'sony-ps4-slim-1tb-cuh2006')
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canonical_products (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT,
  model_number  TEXT,
  image_url     TEXT,
  is_active     INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- Table: platform_listings
-- Purpose: One row per seller per platform per canonical product.
-- Notes: Core link table connecting products to platform-specific listings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_listings (
  id                    TEXT PRIMARY KEY,
  canonical_product_id  TEXT NOT NULL REFERENCES canonical_products(id),
  platform              TEXT NOT NULL,
  platform_product_id   TEXT,
  seller_id             TEXT,
  seller_name           TEXT NOT NULL,
  seller_tier           TEXT,
  raw_url               TEXT NOT NULL,
  referral_url          TEXT,
  is_active             INTEGER DEFAULT 1,
  is_pinned_seller      INTEGER DEFAULT 1,
  added_at              TEXT DEFAULT (datetime('now')),
  last_scraped_at       TEXT
);

-- Indexes for platform_listings
CREATE INDEX IF NOT EXISTS idx_listings_canonical 
  ON platform_listings(canonical_product_id);

CREATE INDEX IF NOT EXISTS idx_listings_platform 
  ON platform_listings(platform);

-- -----------------------------------------------------------------------------
-- Table: price_snapshots
-- Purpose: Append-only price history. Never update or delete rows.
-- Notes: Prices stored as integer IDR (no decimals). Rp 4.500.000 → 4500000
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_snapshots (
  id              TEXT PRIMARY KEY,
  listing_id      TEXT NOT NULL REFERENCES platform_listings(id),
  price           INTEGER NOT NULL,
  original_price  INTEGER,
  discount_pct    INTEGER,
  stock_status    TEXT,
  seller_name     TEXT,
  scraped_at      TEXT DEFAULT (datetime('now'))
);

-- Index for price_snapshots (most recent first per listing)
CREATE INDEX IF NOT EXISTS idx_snapshots_listing 
  ON price_snapshots(listing_id, scraped_at DESC);

-- -----------------------------------------------------------------------------
-- Table: flagged_snapshots
-- Purpose: Snapshots that failed sanity checks. For review and debugging.
-- Notes: Stores raw_html for debugging scrape failures
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flagged_snapshots (
  id                TEXT PRIMARY KEY,
  listing_id        TEXT NOT NULL REFERENCES platform_listings(id),
  scraped_price     INTEGER,
  last_known_price  INTEGER,
  change_ratio      REAL,
  flag_reason       TEXT,
  raw_html          TEXT,
  scraped_at        TEXT DEFAULT (datetime('now')),
  reviewed          INTEGER DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- Table: redirect_links
-- Purpose: Short URL → affiliate URL mapping for the redirector service.
-- Notes: Decouples storefront links from platform-specific affiliate URLs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS redirect_links (
  id            TEXT PRIMARY KEY,
  listing_id    TEXT REFERENCES platform_listings(id),
  target_url    TEXT NOT NULL,
  click_count   INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Seed Data (Optional - for testing)
-- =============================================================================

-- Uncomment to add a test product:
-- INSERT INTO canonical_products (id, name, category, model_number)
-- VALUES ('sony-ps4-slim-1tb-cuh2006', 'Sony PlayStation 4 Slim 1TB', 'gaming-console', 'CUH-2006A');

-- =============================================================================
-- Schema Notes
-- =============================================================================
-- 
-- D1 is SQLite under the hood:
-- - Use TEXT for dates (ISO 8601 format)
-- - Use INTEGER for booleans (0/1) and money (IDR has no decimals)
-- - Foreign keys are NOT enforced by default — add PRAGMA foreign_keys = ON
--   in your Worker if you want enforcement
-- 
-- Platform values for 'platform' column:
-- - 'tokopedia'
-- - 'shopee'
-- - 'blibli'
-- - 'lazada'
-- - 'tiktokshop'
--
-- Seller tier values for 'seller_tier' column:
-- - 'official_store' (highest trust)
-- - 'mall'
-- - 'verified'
-- - 'regular'
--
-- Stock status values for 'stock_status' column:
-- - 'available'
-- - 'limited'
-- - 'out_of_stock'
--
-- Flag reason values for 'flag_reason' column:
-- - 'price_below_floor'
-- - 'change_too_large'
-- - 'parse_error'
-- - 'zero_price'
-- - 'model_mismatch'
--
-- =============================================================================