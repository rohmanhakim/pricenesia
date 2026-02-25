/**
 * Price Validation Module
 *
 * Sanity checks for scraped price data using Effect-TS.
 */

import { Effect } from 'effect'
import type { ScrapedData } from '@pricenesia/adapters'
import type { ValidationContext, ValidationResult } from './types'

/**
 * Default validation thresholds.
 */
const DEFAULT_THRESHOLDS = {
  /** Minimum acceptable price in IDR (100 rupiah) */
  price_floor: 100,
  /** Maximum allowed price change ratio (50%) */
  max_change_ratio: 0.5,
}

/**
 * Validation error types.
 */
export class ZeroPriceError {
  readonly _tag = 'ZeroPriceError'
  constructor(readonly price: number | null) {}
}

export class PriceBelowFloorError {
  readonly _tag = 'PriceBelowFloorError'
  constructor(readonly price: number, readonly floor: number) {}
}

export class PriceChangeTooLargeError {
  readonly _tag = 'PriceChangeTooLargeError'
  constructor(
    readonly current: number,
    readonly previous: number,
    readonly ratio: number
  ) {}
}

/**
 * Validate a scraped price against sanity checks.
 * 
 * Checks performed:
 * 1. Price is not null/zero
 * 2. Price is above minimum floor
 * 3. Price change from previous is within acceptable range
 */
export function validatePrice(
  data: ScrapedData,
  context: ValidationContext
): Effect.Effect<ValidationResult, never> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...context }
  
  return Effect.gen(function* (_) {
    // Check 1: Price exists and is not zero
    if (data.price === null || data.price === 0) {
      return {
        valid: false,
        reason: 'zero_price' as const,
        debug: `Price is ${data.price ?? 'null'}`,
      }
    }
    
    const price = data.price
    
    // Check 2: Price is above floor
    if (price < thresholds.price_floor) {
      return {
        valid: false,
        reason: 'price_below_floor' as const,
        debug: `Price ${price} is below floor ${thresholds.price_floor}`,
      }
    }
    
    // Check 3: Price change is within acceptable range (if previous price exists)
    if (context.previous_price !== null && context.previous_price > 0) {
      const change = Math.abs(price - context.previous_price)
      const ratio = change / context.previous_price
      
      if (ratio > thresholds.max_change_ratio) {
        return {
          valid: false,
          reason: 'change_too_large' as const,
          debug: `Price changed from ${context.previous_price} to ${price} (${(ratio * 100).toFixed(1)}% change)`,
        }
      }
    }
    
    return { valid: true }
  })
}

/**
 * Validate multiple price data points in batch.
 */
export function validateBatch(
  dataList: Array<{ data: ScrapedData; context: ValidationContext }>
): Effect.Effect<ValidationResult[], never> {
  return Effect.all(
    dataList.map(({ data, context }) => validatePrice(data, context)),
    { concurrency: 'unbounded' }
  )
}

/**
 * Create a validation context from database records.
 */
export function createValidationContext(
  listing: { platform_id: string },
  previousSnapshot: { price: number | null } | null
): ValidationContext {
  return {
    current_price: null, // Will be set during validation
    previous_price: previousSnapshot?.price ?? null,
    platform: listing.platform_id,
  }
}

/**
 * Run validation and return a ScrapedData with updated flag fields.
 */
export function runValidation(
  data: ScrapedData,
  context: ValidationContext
): ScrapedData {
  const result = Effect.runSync(validatePrice(data, context))
  
  return {
    ...data,
    valid: result.valid,
    flag_reason: result.reason,
  }
}