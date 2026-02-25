// =============================================================================
// Pricenesia Platform Adapters - Main Entry Point
// =============================================================================

import { Effect } from 'effect'
import type { Platform } from '@pricenesia/shared/types'
import type { PlatformAdapter, ScrapedData } from './types'
import { ScrapeError, ParseError, ValidationError } from './types'
import { TokopediaAdapter } from './tokopedia'

// Re-export all types and errors
export * from './types'
export { TokopediaAdapter } from './tokopedia'

// -----------------------------------------------------------------------------
// Adapter Registry
// -----------------------------------------------------------------------------

const adapters: Record<Platform, PlatformAdapter> = {
  tokopedia: TokopediaAdapter,
  shopee: TokopediaAdapter,      // Placeholder until Shopee adapter is implemented
  blibli: TokopediaAdapter,      // Placeholder until Blibli adapter is implemented
  lazada: TokopediaAdapter,      // Placeholder until Lazada adapter is implemented
  tiktokshop: TokopediaAdapter,  // Placeholder until TikTok Shop adapter is implemented
}

// -----------------------------------------------------------------------------
// Adapter Selection
// -----------------------------------------------------------------------------

/**
 * Get the platform adapter for a given platform.
 * @param platform - Platform identifier
 * @returns Platform adapter instance
 * @throws Error if platform is not supported
 */
export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters[platform]
  if (!adapter) {
    throw new Error(`Unsupported platform: ${platform}`)
  }
  return adapter
}

/**
 * Check if a platform is supported.
 * @param platform - Platform identifier
 * @returns true if platform has an adapter
 */
export function isPlatformSupported(platform: string): platform is Platform {
  return platform in adapters
}

/**
 * Get list of supported platforms.
 * @returns Array of platform identifiers
 */
export function getSupportedPlatforms(): Platform[] {
  return Object.keys(adapters) as Platform[]
}

// -----------------------------------------------------------------------------
// Effect-based Execution Helpers
// -----------------------------------------------------------------------------

/**
 * Extract data from a page using the specified platform adapter.
 * Returns an Effect that can be composed with other Effect operations.
 * 
 * @param platform - Platform identifier
 * @param page - Puppeteer page object
 * @returns Effect that resolves to ScrapedData or fails with a tagged error
 */
export function extractWithAdapter(
  platform: Platform,
  page: unknown
): Effect.Effect<ScrapedData, ScrapeError | ParseError | ValidationError> {
  const adapter = getAdapter(platform)
  // Note: listing is optional for extraction, adapter can work with just the page
  // The adapter interface requires listing but the Tokopedia adapter ignores it
  return adapter.extract(page, {} as any)
}

/**
 * Run an extraction Effect and return a Promise.
 * Useful for integrating with non-Effect code.
 * 
 * @param platform - Platform identifier
 * @param page - Puppeteer page object
 * @returns Promise that resolves to ScrapedData
 */
export async function runExtraction(
  platform: Platform,
  page: unknown
): Promise<ScrapedData> {
  const adapter = getAdapter(platform)
  return Effect.runPromise(adapter.extract(page, {} as any))
}

/**
 * Run an extraction Effect with error handling.
 * Returns a result object with success/error status.
 * 
 * @param platform - Platform identifier
 * @param page - Puppeteer page object
 * @returns Promise that resolves to a result object
 */
export async function runExtractionSafe(
  platform: Platform,
  page: unknown
): Promise<
  | { success: true; data: ScrapedData }
  | { success: false; error: ScrapeError | ParseError | ValidationError }
> {
  const adapter = getAdapter(platform)
  const result = await Effect.runPromiseExit(adapter.extract(page, {} as any))
  
  if (result._tag === 'Success') {
    return { success: true, data: result.value }
  }
  
  // Extract the error from the failure
  const error = result.cause._tag === 'Fail' 
    ? result.cause.error as ScrapeError | ParseError | ValidationError
    : new ParseError({ reason: 'invalid_data', message: 'Unknown error during extraction' })
  
  return { success: false, error }
}

// -----------------------------------------------------------------------------
// Layer for Dependency Injection (TODO)
// -----------------------------------------------------------------------------

/**
 * TODO: Implement proper Layer/Tag pattern for dependency injection.
 * For now, use runExtraction() or runExtractionSafe() directly.
 */
