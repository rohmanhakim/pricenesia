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
