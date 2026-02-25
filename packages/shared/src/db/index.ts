// =============================================================================
// Pricenesia Shared Database Utilities
// =============================================================================

import type { Product, Listing, ListingListFilters, UpdateListingRequest } from '../types'

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
