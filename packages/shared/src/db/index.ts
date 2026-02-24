// =============================================================================
// Pricenesia Shared Database Utilities
// =============================================================================

import type { Product } from '../types'

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