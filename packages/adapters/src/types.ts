/**
 * Platform Adapter Types
 *
 * Core interfaces and error types for platform-specific scraping adapters.
 */

import { Effect, Data } from 'effect'

// ============================================================================
// Scraped Data Types
// ============================================================================

export type StockStatus = 'available' | 'limited' | 'out_of_stock'

export interface ScrapedData {
  /** Current sale price in IDR (integer, no decimals) */
  price: number | null
  /** Original price before discount (from slashPriceFmt) */
  original_price: number | null
  /** Stock availability status */
  stock_status: StockStatus | null
  /** Seller/shop name at time of scrape */
  seller_name: string | null
  /** Whether the scraped data is valid and usable */
  valid: boolean
  /** Reason for validation failure, if any */
  flag_reason?: 'parse_error' | 'zero_price' | 'price_below_floor' | 'change_too_large' | 'product_deleted' | string
  /** Raw debug output for troubleshooting */
  raw_debug?: string
}

// ============================================================================
// Puppeteer Types (for browser-based scraping)
// ============================================================================

/**
 * Minimal Puppeteer Page interface for adapter extraction.
 * This allows adapters to work with any page-like object that implements these methods.
 */
export interface PuppeteerPage {
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>
  $eval<T>(selector: string, fn: (el: Element) => T | Promise<T>): Promise<T>
  $(selector: string): Promise<{ evaluate<T>(fn: (el: Element) => T | Promise<T>): Promise<T> } | null>
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>
  url(): string
  setViewport(viewport: { width: number; height: number }): Promise<void>
  setUserAgent(userAgent: string): Promise<void>
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>
}

// ============================================================================
// Platform Adapter Interface
// ============================================================================

/**
 * Platform adapter interface for extracting product data from a rendered page.
 *
 * Adapters return Effect types for composable error handling.
 */
export interface PlatformAdapter {
  /** Platform identifier (e.g., 'tokopedia', 'shopee') */
  readonly name: string
  /**
   * Extract product data from a Puppeteer page.
   * Returns an Effect that either succeeds with ScrapedData or fails with a tagged error.
   */
  extract(page: unknown, listing: { raw_url: string }): Effect.Effect<ScrapedData, ParseError | ScrapeError | ValidationError>
}

// ============================================================================
// Tagged Errors
// ============================================================================

export class ParseError extends Data.TaggedError('ParseError')<{
  reason: string
  message: string
  raw_debug?: string
}> {}

export class NavigationError extends Data.TaggedError('NavigationError')<{
  url: string
  message: string
  statusCode?: number
}> {}

export class TimeoutError extends Data.TaggedError('TimeoutError')<{
  url: string
  timeoutMs: number
  message: string
}> {}

// Legacy error types for backwards compatibility
export class ScrapeError extends Data.TaggedError('ScrapeError')<{
  reason: string
  message: string
  raw_debug?: string
}> {}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  field: string
  message: string
}> {}

// Page context for adapters
export interface PageContext {
  url: string
  platform: string
}

// ============================================================================
// Tokopedia-Specific Types (Zeus Framework / Apollo Cache)
// ============================================================================

/**
 * Apollo Client cache entry for price data.
 * Found at: $ROOT_QUERY.pdpMainInfo(...).components.3.data.0.price
 */
export interface TokopediaPriceObject {
  /** Sale price in IDR (integer, ready to write to DB) */
  value: number
  /** Formatted price string for display (e.g., "Rp4.599.000") */
  priceFmt: string
  /** Original/crossed-out price string (e.g., "Rp4.649.000") */
  slashPriceFmt: string
  /** Discount percentage string (e.g., "1%") */
  discPercentage: string
  /** Apollo type name */
  __typename: 'pdpContentSnapshotPrice'
}

/**
 * Apollo Client cache entry for stock data.
 * Found at: $ROOT_QUERY.pdpMainInfo(...).components.3.data.0.stock
 */
export interface TokopediaStockObject {
  /** Whether seller tracks stock. false = stock not tracked = treat as available */
  useStock: boolean
  /** Stock count as string. Only meaningful when useStock is true */
  value: string
  /** Display label (e.g., "Stok Terbatas"). Empty = no wording shown */
  stockWording: string
  /** Apollo type name */
  __typename: 'pdpContentSnapshotStock'
}

/**
 * Apollo Client cache entry for basic product info.
 * Found at: pdpBasicInfo{productID}
 */
export interface TokopediaBasicInfo {
  /** Tokopedia's internal product ID */
  productID: string
  /** Seller/shop name at scrape time */
  shopName: string
  /** Numeric shop ID - stable even if name changes */
  shopID: string
  /** Product status - check for DELETED/INACTIVE to detect delisted products */
  status: 'ACTIVE' | 'DELETED' | 'INACTIVE' | string
  /** Product alias (slug) */
  alias: string
  /** Product URL */
  url: string
  /** Apollo type name */
  __typename: 'pdpBasicInfo'
}

/**
 * Component data node containing price, stock, and product name.
 * Found at: $ROOT_QUERY.pdpMainInfo(...).components.3.data.0
 */
export interface TokopediaComponentData {
  /** Product name */
  name: string
  /** Official Store flag */
  isOS: boolean
  /** Power Merchant badge */
  isPowerMerchant: boolean
  /** Preorder information */
  preorder: { isActive: boolean; duration: number; timeUnit: string }
  /** Apollo type name */
  __typename: 'pdpDataProductContent'
}

/**
 * Apollo Client normalized cache structure.
 * Keys are flattened Apollo references like "$ROOT_QUERY.pdpMainInfo(...).components.3.data.0.price"
 */
export interface TokopediaApolloCache {
  [key: string]: unknown
}

// Legacy interface - kept for backwards compatibility but deprecated
/**
 * @deprecated Tokopedia no longer uses __NEXT_DATA__. Use TokopediaApolloCache instead.
 */
export interface TokopediaNextData {
  props?: {
    pageProps?: {
      layoutData?: {
        pdpGetLayout?: {
          basicInfo?: {
            id?: number
            name?: string
            price?: number
            priceRange?: Array<{ price?: number }>
            url?: string
          }
          components?: {
            seller?: {
              id?: number
              name?: string
              url?: string
              isOfficial?: boolean
            }
            stock?: {
              isAvailable?: boolean
              stock?: number
            }
          }
        }
      }
    }
  }
}