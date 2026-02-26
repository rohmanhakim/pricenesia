/**
 * Tokopedia Platform Adapter
 *
 * Extracts product data from Tokopedia PDP (Product Detail Page).
 *
 * IMPORTANT: As of 2026, Tokopedia migrated from Next.js to a custom framework called Zeus.
 * Product data is now stored in `window.__cache` - an Apollo Client normalized cache -
 * serialized inside an inline `<script>` tag. The old `__NEXT_DATA__` approach no longer works.
 *
 * @see docs/tokopedia-scraping-guide.md for detailed documentation
 * @see docs/scrapings/tokopedia-findings.md for research findings
 */

import { Effect } from 'effect'
import type { Listing } from '@pricenesia/shared/types'
import { TOKOPEDIA_PRICE_KEY_PATTERN } from '@pricenesia/shared'
import type {
  ScrapedData,
  PuppeteerPage,
  PlatformAdapter,
  TokopediaApolloCache,
  TokopediaPriceObject,
  TokopediaStockObject,
  TokopediaBasicInfo,
} from './types'
import { ParseError, ScrapeError } from './types'

// ============================================================================
// Tokopedia Adapter
// ============================================================================

export const TokopediaAdapter: PlatformAdapter = {
  name: 'tokopedia',

  extract(page: unknown, _listing: Listing): Effect.Effect<ScrapedData, ParseError | ScrapeError> {
    const puppeteerPage = page as PuppeteerPage

    return Effect.gen(function* (_) {
      // 1. Extract Apollo cache from window.__cache
      const cache = yield* _(extractApolloCache(puppeteerPage))

      if (!cache) {
        return {
          price: null,
          original_price: null,
          stock_status: null,
          seller_name: null,
          valid: false,
          flag_reason: 'parse_error',
          raw_debug: 'window.__cache is null or undefined',
        }
      }

      // 2. Find price object by scanning keys (product slug is embedded in key)
      const priceObj = findPriceObject(cache)
      const stockObj = findStockObject(cache)
      const basicInfo = findBasicInfo(cache)

      // 3. Extract price values
      const price = priceObj?.value ?? null
      const originalPrice = parseOriginalPrice(priceObj?.slashPriceFmt)

      // 4. Determine stock status
      const stockStatus = determineStockStatus(stockObj)

      // 5. Validate product is still active
      if (basicInfo?.status && basicInfo.status !== 'ACTIVE') {
        return {
          price: null,
          original_price: null,
          stock_status: 'out_of_stock',
          seller_name: basicInfo.shopName ?? null,
          valid: false,
          flag_reason: 'product_deleted',
          raw_debug: `Product status: ${basicInfo.status}`,
        }
      }

      // 6. Return scraped data
      return {
        price,
        original_price: originalPrice,
        stock_status: stockStatus,
        seller_name: basicInfo?.shopName ?? null,
        valid: !!(price && price > 0),
        flag_reason: !price ? 'parse_error' : undefined,
        raw_debug: price ? undefined : 'Price extraction failed',
      }
    })
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the Apollo cache from window.__cache
 */
function extractApolloCache(page: PuppeteerPage): Effect.Effect<TokopediaApolloCache | null, ParseError> {
  return Effect.tryPromise({
    try: () =>
      page.evaluate(() => {
        return (window as unknown as { __cache?: TokopediaApolloCache }).__cache ?? null
      }),
    catch: (error) =>
      new ParseError({
        reason: 'cache_extraction_failed',
        message: 'Failed to extract window.__cache from Tokopedia page',
        raw_debug: error instanceof Error ? error.message : String(error),
      }),
  })
}

/**
 * Find the price object in the Apollo cache.
 * Keys look like: "$ROOT_QUERY.pdpMainInfo({...}).components.3.data.0.price"
 * We scan by suffix since the product slug is embedded in the key.
 *
 * Note: The component index (e.g., .3.) is not guaranteed to be stable.
 * Tokopedia may change the layout, shifting the price component to a different index.
 * Using regex to match any component index makes this more robust.
 */
function findPriceObject(cache: TokopediaApolloCache): TokopediaPriceObject | null {
  const priceKey = Object.keys(cache).find(
    (k) => k.startsWith('$ROOT_QUERY.pdpMainInfo') && TOKOPEDIA_PRICE_KEY_PATTERN.test(k)
  )

  if (!priceKey) return null

  const obj = cache[priceKey]
  if (obj && typeof obj === 'object' && 'value' in obj) {
    return obj as TokopediaPriceObject
  }

  return null
}

/**
 * Find the stock object in the Apollo cache.
 * Uses the same key pattern as price, just different suffix.
 *
 * Note: Like findPriceObject, we use regex to match any component index
 * for robustness against layout changes.
 */
function findStockObject(cache: TokopediaApolloCache): TokopediaStockObject | null {
  const stockKey = Object.keys(cache).find(
    (k) => k.startsWith('$ROOT_QUERY.pdpMainInfo') && /\.components\.\d+\.data\.0\.stock$/.test(k)
  )

  if (!stockKey) return null

  const obj = cache[stockKey]
  if (obj && typeof obj === 'object' && 'useStock' in obj) {
    return obj as TokopediaStockObject
  }

  return null
}

/**
 * Find the basic product info in the Apollo cache.
 * Key pattern: "pdpBasicInfo{productID}"
 */
function findBasicInfo(cache: TokopediaApolloCache): TokopediaBasicInfo | null {
  const basicKey = Object.keys(cache).find((k) => k.startsWith('pdpBasicInfo'))

  if (!basicKey) return null

  const obj = cache[basicKey]
  if (obj && typeof obj === 'object' && 'productID' in obj) {
    return obj as TokopediaBasicInfo
  }

  return null
}

/**
 * Parse the original price from slashPriceFmt.
 * Input format: "Rp4.649.000" → Output: 4649000
 */
function parseOriginalPrice(slashPriceFmt: string | undefined): number | null {
  if (!slashPriceFmt) return null

  // Remove currency prefix and thousand separators, keep only digits
  const cleaned = slashPriceFmt.replace(/Rp\s*/i, '').replace(/\./g, '').replace(/[^\d]/g, '')

  const price = parseInt(cleaned, 10)
  return isNaN(price) ? null : price
}

/**
 * Determine stock status from the stock object.
 *
 * Key insight: useStock: false means the seller doesn't track stock.
 * This is common for Official Stores - treat as 'available'.
 */
function determineStockStatus(stockObj: TokopediaStockObject | null): ScrapedData['stock_status'] {
  if (!stockObj) return null

  // Seller doesn't track stock = always available
  if (stockObj.useStock === false) {
    return 'available'
  }

  // Seller tracks stock - check the count
  const stockValue = parseInt(stockObj.value ?? '0', 10)

  if (stockValue <= 0) {
    return 'out_of_stock'
  } else if (stockValue <= 10) {
    return 'limited'
  } else {
    return 'available'
  }
}

// ============================================================================
// DOM Fallback (for when Apollo cache is unavailable)
// ============================================================================

/**
 * Fallback extraction using DOM selectors.
 * Use this when window.__cache is not available.
 * Note: This function never fails - it returns data with valid=false when extraction fails.
 */
export async function extractFromDOMAsync(page: PuppeteerPage): Promise<ScrapedData> {
  let priceText: string | null = null
  let sellerName: string | null = null

  try {
    priceText = await page.$eval('[data-testid="lblPDPDetailProductPrice"]', (el) => el.textContent)
  } catch {
    // Ignore errors
  }

  try {
    sellerName = await page.$eval('[data-testid="lblShopName"]', (el) => el.textContent)
  } catch {
    // Ignore errors
  }

  const price = priceText ? parsePriceIDR(priceText) : null

  return {
    price,
    original_price: null,
    stock_status: price && price > 0 ? 'available' : null,
    seller_name: sellerName,
    valid: !!(price && price > 0),
    flag_reason: !price ? 'parse_error' : undefined,
    raw_debug: priceText ?? undefined,
  }
}

/**
 * Parse Indonesian Rupiah price format.
 * Input: "Rp4.599.000" or "Rp 4.599.000" → Output: 4599000
 */
function parsePriceIDR(priceStr: string): number | null {
  const cleaned = priceStr.replace(/Rp\s*/i, '').replace(/\./g, '').replace(/[^\d]/g, '')

  const price = parseInt(cleaned, 10)
  return isNaN(price) ? null : price
}