// =============================================================================
// Pricenesia Shared Utilities
// =============================================================================

// Placeholder for shared utilities
// Will be populated with helper functions as the project evolves

/**
 * Get current timestamp in ISO format
 */
export function getTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Format price in Indonesian Rupiah
 */
export function formatPriceIDR(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
  }).format(price)
}