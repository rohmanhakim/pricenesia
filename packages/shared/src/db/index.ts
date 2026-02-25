// =============================================================================
// Pricenesia Shared Database Utilities
// =============================================================================

import type { 
  Product, 
  Listing, 
  ListingListFilters, 
  UpdateListingRequest,
  PriceSnapshot,
  FlaggedSnapshot,
  InsertPriceSnapshotData,
  InsertFlaggedSnapshotData,
  StockStatus,
} from '../types'

export const DB_SCHEMA_VERSION = 1

// -----------------------------------------------------------------------------
// Canonical Products
// -----------------------------------------------------------------------------

export interface InsertProductData {
  id: string
  name: string
  category?: string
  model_number?: string
  image_url?: string
}

/**
 * Insert a new canonical product
 */
export async function insertCanonicalProduct(
  db: D1Database,
  data: InsertProductData
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO canonical_products (id, name, category, model_number, image_url)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      data.id,
      data.name,
      data.category ?? null,
      data.model_number ?? null,
      data.image_url ?? null
    )
    .run()
}

/**
 * Check if a canonical product exists by ID
 */
export async function canonicalProductExists(
  db: D1Database,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare(`SELECT 1 FROM canonical_products WHERE id = ?`)
    .bind(id)
    .first()

  return result !== null
}

/**
 * Find a canonical product by ID
 */
export async function findCanonicalProductById(
  db: D1Database,
  id: string
): Promise<Product | null> {
  return await db
    .prepare(`SELECT * FROM canonical_products WHERE id = ?`)
    .bind(id)
    .first<Product>()
}

/**
 * Find all canonical products
 */
export async function findAllCanonicalProducts(
  db: D1Database,
  activeOnly = true
): Promise<Product[]> {
  const sql = activeOnly
    ? `SELECT * FROM canonical_products WHERE is_active = 1 ORDER BY created_at DESC`
    : `SELECT * FROM canonical_products ORDER BY created_at DESC`

  const result = await db.prepare(sql).all<Product>()
  return result.results
}

// -----------------------------------------------------------------------------
// Update and Delete
// -----------------------------------------------------------------------------

export interface UpdateProductData {
  name?: string
  category?: string
  model_number?: string
  image_url?: string
  is_active?: boolean
}

/**
 * Update a canonical product (partial update)
 * Only provided fields will be updated
 */
export async function updateCanonicalProduct(
  db: D1Database,
  id: string,
  data: UpdateProductData
): Promise<Product | null> {
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (data.name !== undefined) {
    updates.push('name = ?')
    values.push(data.name)
  }
  if (data.category !== undefined) {
    updates.push('category = ?')
    values.push(data.category ?? null)
  }
  if (data.model_number !== undefined) {
    updates.push('model_number = ?')
    values.push(data.model_number ?? null)
  }
  if (data.image_url !== undefined) {
    updates.push('image_url = ?')
    values.push(data.image_url ?? null)
  }
  if (data.is_active !== undefined) {
    updates.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }

  if (updates.length === 0) {
    // No fields to update, just return existing product
    return findCanonicalProductById(db, id)
  }

  values.push(id)

  await db
    .prepare(
      `UPDATE canonical_products SET ${updates.join(', ')} WHERE id = ?`
    )
    .bind(...values)
    .run()

  return findCanonicalProductById(db, id)
}

/**
 * Soft delete a canonical product (sets is_active = 0)
 * Returns true if product was found and deleted, false otherwise
 */
export async function deleteCanonicalProduct(
  db: D1Database,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE canonical_products SET is_active = 0 WHERE id = ?`
    )
    .bind(id)
    .run()

  return result.meta.changes > 0
}

// -----------------------------------------------------------------------------
// Platform Listings
// -----------------------------------------------------------------------------

export interface InsertListingData {
  id: string
  canonical_product_id: string
  platform: string
  platform_product_id?: string
  seller_id?: string
  seller_name: string
  seller_tier?: string
  raw_url: string
  condition?: string
  is_pinned_seller?: boolean
}

/**
 * Insert a new platform listing
 */
export async function insertListing(
  db: D1Database,
  data: InsertListingData
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO platform_listings 
        (id, canonical_product_id, platform, platform_product_id, seller_id, seller_name, seller_tier, raw_url, is_active, is_pinned_seller, condition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      data.id,
      data.canonical_product_id,
      data.platform,
      data.platform_product_id ?? null,
      data.seller_id ?? null,
      data.seller_name,
      data.seller_tier ?? null,
      data.raw_url,
      data.is_pinned_seller !== false ? 1 : 0,
      data.condition ?? 'new'
    )
    .run()
}

/**
 * Check if a listing exists by ID
 */
export async function listingExists(
  db: D1Database,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare(`SELECT 1 FROM platform_listings WHERE id = ?`)
    .bind(id)
    .first()

  return result !== null
}

/**
 * Find a listing by ID
 */
export async function findListingById(
  db: D1Database,
  id: string
): Promise<Listing | null> {
  return await db
    .prepare(`SELECT * FROM platform_listings WHERE id = ?`)
    .bind(id)
    .first<Listing>()
}

/**
 * Find all listings with optional filters
 */
export async function findAllListings(
  db: D1Database,
  filters?: ListingListFilters,
  activeOnly = true
): Promise<Listing[]> {
  const conditions: string[] = []
  const values: (string | number)[] = []

  if (activeOnly) {
    conditions.push('pl.is_active = 1')
  }

  if (filters?.canonical_product_id) {
    conditions.push('pl.canonical_product_id = ?')
    values.push(filters.canonical_product_id)
  }

  if (filters?.platform) {
    conditions.push('pl.platform = ?')
    values.push(filters.platform)
  }

  if (filters?.is_active !== undefined) {
    conditions.push('pl.is_active = ?')
    values.push(filters.is_active ? 1 : 0)
  }

  if (filters?.condition) {
    conditions.push('pl.condition = ?')
    values.push(filters.condition)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT pl.* FROM platform_listings pl ${whereClause} ORDER BY pl.added_at DESC`

  const result = await db
    .prepare(sql)
    .bind(...values)
    .all<Listing>()

  return result.results
}

/**
 * Update a listing (partial update)
 * Only provided fields will be updated
 */
export async function updateListing(
  db: D1Database,
  id: string,
  data: UpdateListingRequest
): Promise<Listing | null> {
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (data.seller_name !== undefined) {
    updates.push('seller_name = ?')
    values.push(data.seller_name)
  }
  if (data.seller_tier !== undefined) {
    updates.push('seller_tier = ?')
    values.push(data.seller_tier ?? null)
  }
  if (data.raw_url !== undefined) {
    updates.push('raw_url = ?')
    values.push(data.raw_url)
  }
  if (data.referral_url !== undefined) {
    updates.push('referral_url = ?')
    values.push(data.referral_url ?? null)
  }
  if (data.is_active !== undefined) {
    updates.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }
  if (data.is_pinned_seller !== undefined) {
    updates.push('is_pinned_seller = ?')
    values.push(data.is_pinned_seller ? 1 : 0)
  }
  if (data.condition !== undefined) {
    updates.push('condition = ?')
    values.push(data.condition)
  }

  if (updates.length === 0) {
    // No fields to update, just return existing listing
    return findListingById(db, id)
  }

  values.push(id)

  await db
    .prepare(
      `UPDATE platform_listings SET ${updates.join(', ')} WHERE id = ?`
    )
    .bind(...values)
    .run()

  return findListingById(db, id)
}

/**
 * Soft delete a listing (sets is_active = 0)
 * Returns true if listing was found and deleted, false otherwise
 */
export async function deleteListing(
  db: D1Database,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE platform_listings SET is_active = 0 WHERE id = ?`
    )
    .bind(id)
    .run()

  return result.meta.changes > 0
}

// -----------------------------------------------------------------------------
// Price Snapshots
// -----------------------------------------------------------------------------

/**
 * Insert a new price snapshot
 * Append-only: never update or delete
 */
export async function insertPriceSnapshot(
  db: D1Database,
  data: InsertPriceSnapshotData
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO price_snapshots 
        (id, listing_id, price, original_price, discount_pct, stock_status, seller_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.id,
      data.listing_id,
      data.price,
      data.original_price ?? null,
      data.discount_pct ?? null,
      data.stock_status ?? null,
      data.seller_name ?? null
    )
    .run()
}

/**
 * Find the latest price snapshot for a listing
 */
export async function findLatestPriceForListing(
  db: D1Database,
  listingId: string
): Promise<PriceSnapshot | null> {
  return await db
    .prepare(
      `SELECT * FROM price_snapshots 
       WHERE listing_id = ? 
       ORDER BY scraped_at DESC 
       LIMIT 1`
    )
    .bind(listingId)
    .first<PriceSnapshot>()
}

/**
 * Find all price snapshots for a listing (for price history)
 */
export async function findPriceHistoryForListing(
  db: D1Database,
  listingId: string,
  limit = 30
): Promise<PriceSnapshot[]> {
  const result = await db
    .prepare(
      `SELECT * FROM price_snapshots 
       WHERE listing_id = ? 
       ORDER BY scraped_at ASC 
       LIMIT ?`
    )
    .bind(listingId, limit)
    .all<PriceSnapshot>()

  return result.results
}

// -----------------------------------------------------------------------------
// Flagged Snapshots
// -----------------------------------------------------------------------------

/**
 * Insert a flagged snapshot (failed sanity check)
 */
export async function insertFlaggedSnapshot(
  db: D1Database,
  data: InsertFlaggedSnapshotData
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO flagged_snapshots 
        (id, listing_id, scraped_price, last_known_price, change_ratio, flag_reason, raw_html)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.id,
      data.listing_id,
      data.scraped_price ?? null,
      data.last_known_price ?? null,
      data.change_ratio ?? null,
      data.flag_reason,
      data.raw_html ?? null
    )
    .run()
}

/**
 * Find unreviewed flagged snapshots
 */
export async function findUnreviewedFlaggedSnapshots(
  db: D1Database,
  limit = 50
): Promise<FlaggedSnapshot[]> {
  const result = await db
    .prepare(
      `SELECT * FROM flagged_snapshots 
       WHERE reviewed = 0 
       ORDER BY scraped_at DESC 
       LIMIT ?`
    )
    .bind(limit)
    .all<FlaggedSnapshot>()

  return result.results
}

/**
 * Mark a flagged snapshot as reviewed
 */
export async function markFlaggedSnapshotReviewed(
  db: D1Database,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE flagged_snapshots SET reviewed = 1 WHERE id = ?`
    )
    .bind(id)
    .run()

  return result.meta.changes > 0
}

// -----------------------------------------------------------------------------
// Price Snapshots - Extended Queries
// -----------------------------------------------------------------------------

/**
 * Find all price snapshots with optional filtering
 */
export async function findAllPriceSnapshots(
  db: D1Database,
  options?: {
    platform?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
  }
): Promise<(PriceSnapshot & { 
  listing?: {
    platform: string
    canonical_product_id: string
    product_name: string | null
  } 
})[]> {
  const conditions: string[] = []
  const values: (string | number)[] = []
  
  if (options?.platform) {
    conditions.push('pl.platform = ?')
    values.push(options.platform)
  }
  
  if (options?.from) {
    conditions.push('ps.scraped_at >= ?')
    values.push(options.from)
  }
  
  if (options?.to) {
    conditions.push('ps.scraped_at <= ?')
    values.push(options.to)
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options?.limit ?? 30
  const offset = options?.offset ?? 0
  
  values.push(limit, offset)
  
  const sql = `
    SELECT ps.*, 
           pl.platform, 
           pl.canonical_product_id,
           cp.name as product_name
    FROM price_snapshots ps
    JOIN platform_listings pl ON pl.id = ps.listing_id
    JOIN canonical_products cp ON cp.id = pl.canonical_product_id
    ${whereClause}
    ORDER BY ps.scraped_at DESC
    LIMIT ? OFFSET ?
  `
  
  const result = await db
    .prepare(sql)
    .bind(...values)
    .all()
  
  return result.results.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    listing_id: row.listing_id as string,
    price: row.price as number,
    original_price: row.original_price as number | null,
    discount_pct: row.discount_pct as number | null,
    stock_status: (row.stock_status ?? null) as StockStatus,
    seller_name: row.seller_name as string | null,
    scraped_at: row.scraped_at as string,
    listing: {
      platform: row.platform as string,
      canonical_product_id: row.canonical_product_id as string,
      product_name: row.product_name as string | null,
    },
  }))
}

/**
 * Count all price snapshots with optional filtering
 */
export async function countAllPriceSnapshots(
  db: D1Database,
  options?: {
    platform?: string
    from?: string
    to?: string
  }
): Promise<number> {
  const conditions: string[] = []
  const values: (string | number)[] = []
  
  if (options?.platform) {
    conditions.push('pl.platform = ?')
    values.push(options.platform)
  }
  
  if (options?.from) {
    conditions.push('ps.scraped_at >= ?')
    values.push(options.from)
  }
  
  if (options?.to) {
    conditions.push('ps.scraped_at <= ?')
    values.push(options.to)
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  
  const sql = `
    SELECT COUNT(*) as count
    FROM price_snapshots ps
    JOIN platform_listings pl ON pl.id = ps.listing_id
    ${whereClause}
  `
  
  const result = await db
    .prepare(sql)
    .bind(...values)
    .first<{ count: number }>()
  
  return result?.count ?? 0
}

/**
 * Find flagged snapshots with listing and product details
 */
export async function findFlaggedSnapshotsWithDetails(
  db: D1Database,
  options?: {
    platform?: string
    limit?: number
    offset?: number
  }
): Promise<(FlaggedSnapshot & {
  listing: {
    platform: string
    seller_name: string
    canonical_product_id: string
    product_name: string | null
    raw_url: string
  }
})[]> {
  const conditions: string[] = ['fs.reviewed = 0']
  const values: (string | number)[] = []
  
  if (options?.platform) {
    conditions.push('pl.platform = ?')
    values.push(options.platform)
  }
  
  const whereClause = `WHERE ${conditions.join(' AND ')}`
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0
  
  values.push(limit, offset)
  
  const sql = `
    SELECT fs.*, 
           pl.platform, 
           pl.seller_name,
           pl.canonical_product_id,
           pl.raw_url,
           cp.name as product_name
    FROM flagged_snapshots fs
    JOIN platform_listings pl ON pl.id = fs.listing_id
    JOIN canonical_products cp ON cp.id = pl.canonical_product_id
    ${whereClause}
    ORDER BY fs.scraped_at DESC
    LIMIT ? OFFSET ?
  `
  
  const result = await db
    .prepare(sql)
    .bind(...values)
    .all()
  
  return result.results.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    listing_id: row.listing_id as string,
    scraped_price: row.scraped_price as number | null,
    last_known_price: row.last_known_price as number | null,
    change_ratio: row.change_ratio as number | null,
    flag_reason: row.flag_reason as string | null,
    raw_html: row.raw_html as string | null,
    scraped_at: row.scraped_at as string,
    reviewed: row.reviewed as number,
    listing: {
      platform: row.platform as string,
      seller_name: row.seller_name as string,
      canonical_product_id: row.canonical_product_id as string,
      product_name: row.product_name as string | null,
      raw_url: row.raw_url as string,
    },
  }))
}

/**
 * Count flagged snapshots with optional filtering
 */
export async function countFlaggedSnapshots(
  db: D1Database,
  options?: {
    platform?: string
  }
): Promise<number> {
  const conditions: string[] = ['reviewed = 0']
  const values: (string | number)[] = []
  
  if (options?.platform) {
    conditions.push('listing_id IN (SELECT id FROM platform_listings WHERE platform = ?)')
    values.push(options.platform)
  }
  
  const whereClause = `WHERE ${conditions.join(' AND ')}`
  
  const sql = `SELECT COUNT(*) as count FROM flagged_snapshots ${whereClause}`
  
  const result = await db
    .prepare(sql)
    .bind(...values)
    .first<{ count: number }>()
  
  return result?.count ?? 0
}

/**
 * Find a flagged snapshot by ID
 */
export async function findFlaggedSnapshotById(
  db: D1Database,
  id: string
): Promise<FlaggedSnapshot | null> {
  return await db
    .prepare(`SELECT * FROM flagged_snapshots WHERE id = ?`)
    .bind(id)
    .first<FlaggedSnapshot>()
}

/**
 * Count price history for a listing with optional date filtering
 */
export async function countPriceHistoryForListing(
  db: D1Database,
  listingId: string,
  options?: {
    from?: string
    to?: string
  }
): Promise<number> {
  const conditions: string[] = ['listing_id = ?']
  const values: (string)[] = [listingId]
  
  if (options?.from) {
    conditions.push('scraped_at >= ?')
    values.push(options.from)
  }
  
  if (options?.to) {
    conditions.push('scraped_at <= ?')
    values.push(options.to)
  }
  
  const whereClause = `WHERE ${conditions.join(' AND ')}`
  
  const sql = `SELECT COUNT(*) as count FROM price_snapshots ${whereClause}`
  
  const result = await db
    .prepare(sql)
    .bind(...values)
    .first<{ count: number }>()
  
  return result?.count ?? 0
}

/**
 * Find price history for a listing with pagination and date filtering
 */
export async function findPriceHistoryForListingPaginated(
  db: D1Database,
  listingId: string,
  options?: {
    from?: string
    to?: string
    limit?: number
    offset?: number
  }
): Promise<PriceSnapshot[]> {
  const conditions: string[] = ['listing_id = ?']
  const values: (string | number)[] = [listingId]
  
  if (options?.from) {
    conditions.push('scraped_at >= ?')
    values.push(options.from)
  }
  
  if (options?.to) {
    conditions.push('scraped_at <= ?')
    values.push(options.to)
  }
  
  const whereClause = `WHERE ${conditions.join(' AND ')}`
  const limit = options?.limit ?? 30
  const offset = options?.offset ?? 0
  
  values.push(limit, offset)
  
  const sql = `
    SELECT * FROM price_snapshots 
    ${whereClause}
    ORDER BY scraped_at DESC
    LIMIT ? OFFSET ?
  `
  
  const result = await db
    .prepare(sql)
    .bind(...values)
    .all<PriceSnapshot>()
  
  return result.results
}

// -----------------------------------------------------------------------------
// Scrape Status Updates
// -----------------------------------------------------------------------------

/**
 * Update the last_scraped_at timestamp for a listing
 */
export async function updateListingScrapedAt(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE platform_listings SET last_scraped_at = datetime('now') WHERE id = ?`
    )
    .bind(id)
    .run()
}

/**
 * Find all listings due for scraping (active, pinned, with product info)
 */
export async function findListingsForScrape(
  db: D1Database
): Promise<(Listing & { model_number: string | null; product_name: string | null })[]> {
  const result = await db
    .prepare(
      `SELECT pl.*, cp.model_number, cp.name as product_name
       FROM platform_listings pl
       JOIN canonical_products cp ON cp.id = pl.canonical_product_id
       WHERE pl.is_active = 1 
         AND pl.is_pinned_seller = 1 
         AND cp.is_active = 1
       ORDER BY pl.platform, pl.last_scraped_at ASC NULLS FIRST`
    )
    .all<Listing & { model_number: string | null; product_name: string | null }>()

  return result.results
}
