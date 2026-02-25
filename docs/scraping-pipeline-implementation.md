# Scraping Pipeline Implementation Breakdown

This document breaks down the scraping pipeline implementation into manageable phases to avoid context limit issues.

---

## Overview

The scraping pipeline consists of:
1. **Adapters Package** - Platform-specific scraping logic
2. **Shared DB Functions** - Price snapshot storage
3. **Scraper Package** - Cloudflare Workflow with Browser Rendering
4. **Integration** - Wire up first-scrape triggers

---

## Phase 1: Foundation (Current Session)

### 1.1 Create `packages/adapters/`

**Files to create:**
- `packages/adapters/package.json`
- `packages/adapters/tsconfig.json`
- `packages/adapters/src/types.ts`
- `packages/adapters/src/tokopedia.ts`
- `packages/adapters/src/index.ts`

**Types to define (`types.ts`):**
```ts
export type StockStatus = 'available' | 'limited' | 'out_of_stock' | null

export interface ScrapedData {
  price: number | null
  original_price: number | null
  stock_status: StockStatus
  seller_name: string | null
  valid: boolean
  flag_reason?: string
  raw_debug?: string
}

export interface PlatformAdapter {
  extract(page: Page, listing: Listing): Promise<ScrapedData>
}
```

**Tokopedia Adapter (`tokopedia.ts`):**
- Parse `__NEXT_DATA__` JSON blob
- Extract price from `pdpGetLayout.basicInfo`
- Fallback to DOM scraping if JSON path changes

### 1.2 Add Price Snapshot Types to `packages/shared/types/index.ts`

```ts
export interface PriceSnapshot {
  id: string
  listing_id: string
  price: number
  original_price: number | null
  discount_pct: number | null
  stock_status: StockStatus | null
  seller_name: string | null
  scraped_at: string
}

export interface FlaggedSnapshot {
  id: string
  listing_id: string
  scraped_price: number | null
  last_known_price: number | null
  change_ratio: number | null
  flag_reason: string | null
  raw_html: string | null
  scraped_at: string
  reviewed: number
}

export interface InsertPriceSnapshotData {
  id: string
  listing_id: string
  price: number
  original_price?: number
  discount_pct?: number
  stock_status?: StockStatus
  seller_name?: string
}

export interface InsertFlaggedSnapshotData {
  id: string
  listing_id: string
  scraped_price: number | null
  last_known_price: number | null
  change_ratio: number | null
  flag_reason: string
  raw_html?: string
}
```

### 1.3 Add Price Snapshot DB Functions to `packages/shared/db/index.ts`

- `insertPriceSnapshot(db, data)` - Insert valid price snapshot
- `insertFlaggedSnapshot(db, data)` - Insert flagged/anomalous snapshot
- `findLatestPriceForListing(db, listingId)` - Get last known price for validation
- `updateListingScrapedAt(db, listingId)` - Update last_scraped_at timestamp

---

## Phase 2: Scraper Workflow Package

### 2.1 Create `packages/scraper/`

**Files to create:**
- `packages/scraper/package.json`
- `packages/scraper/tsconfig.json`
- `packages/scraper/wrangler.toml`
- `packages/scraper/src/index.ts`
- `packages/scraper/src/workflows/price-refresh.ts`
- `packages/scraper/src/browser.ts`
- `packages/scraper/src/sanity-check.ts`

**Key implementations:**
- `PriceRefreshWorkflow` class extending `WorkflowEntrypoint`
- Browser Rendering integration with proper headers
- Sequential scraping with jitter delay (4-8 seconds)
- Price sanity check validation

**Wrangler bindings:**
- `DB` - D1 database
- `BROWSER` - Browser Rendering API
- `PRICE_REFRESH_WORKFLOW` - Self-reference for workflow

**Cron trigger:** `0 19 * * *` (2:00 AM WIB)

### 2.2 Sanity Check Logic

```ts
function validateSnapshot(
  newPrice: number | null,
  lastKnownPrice: number | null,
  platform: string
): { valid: boolean; flag_reason?: string }
```

- Check for zero/invalid prices
- Check price floor (Rp 10,000 minimum)
- Check for suspicious swings (>40% daily change)

---

## Phase 3: Integration

### 3.1 Update `packages/ingestion-api/`

**Changes to `wrangler.toml`:**
```toml
[[workflows]]
name = "daily-price-refresh"
binding = "PRICE_REFRESH_WORKFLOW"
class_name = "PriceRefreshWorkflow"
```

**Changes to `src/routes/listings.ts`:**
- After creating listing, trigger first-scrape via Workflow
- Use `env.PRICE_REFRESH_WORKFLOW.create()` to start workflow

### 3.2 Add Manual Re-scrape Endpoint

**New endpoint:** `POST /api/listings/:id/scrape`
- Trigger scrape for specific listing
- Return immediately, scrape happens async

---

## Phase 4: Additional Platform Adapters

After the core pipeline is working:

- `packages/adapters/src/shopee.ts` - Shopee adapter (High difficulty)
- `packages/adapters/src/blibli.ts` - Blibli adapter (Medium difficulty)
- `packages/adapters/src/lazada.ts` - Lazada adapter (High difficulty)
- `packages/adapters/src/tiktokshop.ts` - TikTok Shop adapter (Phase 2)

---

## Testing Strategy

Each phase should include:

1. **Unit tests** - Adapter parsing logic
2. **Integration tests** - DB functions
3. **Manual testing** - Workflow execution with real URLs

---

## Dependencies

```
packages/adapters → packages/shared
packages/scraper → packages/shared, packages/adapters
packages/ingestion-api → packages/shared
```

---

## Progress Tracking

- [x] Phase 1: Foundation (adapters + price snapshot functions)
- [ ] Phase 2: Scraper Workflow Package
- [ ] Phase 3: Integration with ingestion-api
- [ ] Phase 4: Additional platform adapters