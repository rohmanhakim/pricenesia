# Tokopedia Listing Page Scraping Guide

This document provides a detailed technical guide for scraping product listing pages from Tokopedia, Indonesia's largest e-commerce platform.

---

## Overview

**Important Framework Migration (2026):** Tokopedia has migrated from Next.js to a custom framework called **Zeus**. Product data is now stored in `window.__cache` — an Apollo Client normalized cache — instead of the previous `__NEXT_DATA__` approach.

**Difficulty Rating:** 🟢 Low - `window.__cache` is stable structured data, just like `__NEXT_DATA__` was.

---

## Framework Identification

Several signals in the HTML confirm the Zeus migration:

| Signal | Value |
|---|---|
| `window.__service` | `"zeus"` |
| `window.__SHELL_REVISION__` | `"SSR"` |
| `window.__PAGE_TYPE__` | `"productdetailpage-desktop"` |
| JS bundle path prefix | `tokopedia-web-sg/zeus_v2/...` |
| Data container | `window.__cache` (Apollo store) |

---

## Page Structure

### URL Format

```
https://www.tokopedia.com/{shop-slug}/{product-slug}
```

Example:
```
https://www.tokopedia.com/coocaa-indonesia-official/coocaa-y65-layar-tv-50-inch-4k-google-tv
```

### Key Data Locations

| Element | Source | Purpose |
|---------|--------|---------|
| `window.__cache` | Apollo normalized cache | Primary data source (all product info) |
| Price (DOM fallback) | `[data-testid="lblPDPDetailProductPrice"]` | Formatted price text |
| Seller name (DOM fallback) | `[data-testid="lblShopName"]` | Shop name text |
| Meta tag | `<meta property="product:price:amount">` | Raw price integer |

---

## Primary Method: `window.__cache` Extraction

### What is `window.__cache`?

`window.__cache` is an Apollo Client normalized cache serialized into a JavaScript object. Keys are flattened Apollo references like `$ROOT_QUERY.pdpMainInfo({...}).components.3.data.0.price`.

### Cache Structure

```typescript
interface TokopediaApolloCache {
  [key: string]: unknown
}

// Example keys:
// "$ROOT_QUERY.pdpMainInfo({\"productKey\":\"...\"}).components.3.data.0.price"
// "$ROOT_QUERY.pdpMainInfo({\"productKey\":\"...\"}).components.3.data.0.stock"
// "pdpBasicInfo100314316658"
```

### Price Object

Found at: `window.__cache["$ROOT_QUERY.pdpMainInfo(...).components.3.data.0.price"]`

```typescript
interface TokopediaPriceObject {
  value: number           // 4599000 - Sale price (integer IDR)
  priceFmt: string        // "Rp4.599.000" - Formatted display
  slashPriceFmt: string   // "Rp4.649.000" - Original/crossed-out price
  discPercentage: string  // "1%" - Discount label
  __typename: 'pdpContentSnapshotPrice'
}
```

### Stock Object

Found at: `window.__cache["$ROOT_QUERY.pdpMainInfo(...).components.3.data.0.stock"]`

```typescript
interface TokopediaStockObject {
  useStock: boolean       // false = stock not tracked = treat as available
  value: string           // "7" - Stock count (only meaningful when useStock: true)
  stockWording: string    // Display label (e.g., "Stok Terbatas")
  __typename: 'pdpContentSnapshotStock'
}
```

### Basic Product Info

Found at: `window.__cache["pdpBasicInfo{productID}"]`

```typescript
interface TokopediaBasicInfo {
  productID: string       // "100314316658"
  shopName: string        // "Coocaa Indonesia Official"
  shopID: string          // "74945..."
  status: string          // "ACTIVE", "DELETED", "INACTIVE"
  alias: string           // Product slug
  url: string             // Product URL
  __typename: 'pdpBasicInfo'
}
```

---

## Extraction Code

### TypeScript Interfaces

```typescript
interface TokopediaApolloCache {
  [key: string]: unknown
}

interface TokopediaPriceObject {
  value: number
  priceFmt: string
  slashPriceFmt: string
  discPercentage: string
  __typename: 'pdpContentSnapshotPrice'
}

interface TokopediaStockObject {
  useStock: boolean
  value: string
  stockWording: string
  __typename: 'pdpContentSnapshotStock'
}

interface TokopediaBasicInfo {
  productID: string
  shopName: string
  shopID: string
  status: 'ACTIVE' | 'DELETED' | 'INACTIVE' | string
  alias: string
  url: string
  __typename: 'pdpBasicInfo'
}
```

### Key Extraction Functions

```typescript
import { Effect } from 'effect'

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
 * Find the price object by scanning keys.
 * Keys look like: "$ROOT_QUERY.pdpMainInfo({...}).components.3.data.0.price"
 * We scan by suffix since the product slug is embedded in the key.
 */
function findPriceObject(cache: TokopediaApolloCache): TokopediaPriceObject | null {
  const priceKey = Object.keys(cache).find(
    (k) => k.startsWith('$ROOT_QUERY.pdpMainInfo') && k.endsWith('.components.3.data.0.price')
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
 */
function findStockObject(cache: TokopediaApolloCache): TokopediaStockObject | null {
  const stockKey = Object.keys(cache).find(
    (k) => k.startsWith('$ROOT_QUERY.pdpMainInfo') && k.endsWith('.components.3.data.0.stock')
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
```

### Price Parsing

```typescript
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
```

### Stock Status Logic

```typescript
function determineStockStatus(stockObj: TokopediaStockObject | null): StockStatus | null {
  if (!stockObj) return null

  // Key insight: useStock: false means the seller doesn't track stock.
  // This is common for Official Stores - treat as 'available'.
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
```

---

## Fallback Method: DOM Scraping

If `window.__अपोcache` parsing fails, fall back to DOM selectors.

### Price Extraction

```typescript
const priceText = await page.$eval(
  '[data-testid="lblPDPDetailProductPrice"]',
  (el) => el.textContent
).catch(() => null)

// priceText format: "Rp4.599.000" or "Rp 4.599.000"
```

### Price Parsing

```typescript
function parsePriceIDR(priceStr: string): number | null {
  const cleaned = priceStr
    .replace(/Rp\s*/i, '')      // Remove "Rp" prefix
    .replace(/\./g, '')          // Remove thousand separators
    .replace(/[^\d]/g, '')       // Remove non-digits

  const price = parseInt(cleaned, 10)
  return isNaN(price) ? null : price
}

// Example: "Rp 4.599.000" -> 4599000
```

### Seller Name Extraction

```typescript
const sellerName = await page.$eval(
  '[data-testid="lblShopName"]',
  (el) => el.textContent
).catch(() => null)
```

---

## Complete Adapter Implementation

```typescript
import { Effect } from 'effect'
import type { Listing } from '@pricenesia/shared/types'
import type { ScrapedData, PuppeteerPage, PlatformAdapter } from './types'
import { ParseError, ScrapeError } from './types'

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

      // 2. Find objects by scanning keys
      const priceObj = findPriceObject(cache)
      const stockObj = findStockObject(cache)
      const basicInfo = findBasicInfo(cache)

      // 3. Extract values
      const price = priceObj?.value ?? null
      const originalPrice = parseOriginalPrice(priceObj?.slashPriceFmt)
      const stockStatus = determineStockStatus(stockObj)

      // 4. Validate product is still active
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

      // 5. Return scraped data
      return {
        price,
        original_price: originalPrice,
        stock_status: stockStatus,
        seller_name: basicInfo?.shopName ?? null,
        valid: !!(price && price > 0),
      }
    })
  },
}
```

---

## Browser Configuration

### User Agent

Tokopedia works with standard desktop user agents:

```typescript
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
```

### Viewport

Desktop viewport recommended:

```typescript
const VIEWPORT = { width: 1440, height: 900 }
```

### Headers

```typescript
await page.setExtraHTTPHeaders({
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
})
```

---

## Wait Strategy

Tokopedia pages are SSR, so the cache data is available immediately after navigation:

```typescript
await page.goto(url, {
  waitUntil: 'networkidle2',  // Wait for JS hydration
  timeout: 30000
})

// Optional: Add small delay for Zeus framework
await page.waitForTimeout(2000)
```

---

## Failure Modes & Monitoring

### Common Issues

| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| `window.__cache` is null | Zeus not fully rendered, or bot detection | Add `waitUntil: 'networkidle2'` + 2s extra sleep |
| No key matching `.components.3.data.0.price` | Component index changed | Widen search: scan all component indices |
| `price = 0` on `priceObj.value` | Flash sale or campaign lock | Check `campaign` node for fallback |
| `basicInfo.status = 'DELETED'` | Product delisted by seller | Flag as `parse_error` and alert |

### Component Index Stability

> ⚠️ The `components.3` index is not guaranteed forever. If Tokopedia adds a new layout component above it, the price component may shift. Consider scanning all `components.N.data.0.price` keys if the `.3` suffix stops returning results.

### Robust Key Scanning

```typescript
// Instead of hardcoding .3., scan all component indices
function findPriceObjectRobust(cache: TokopediaApolloCache): TokopediaPriceObject | null {
  const priceKey = Object.keys(cache).find((k) =>
    k.startsWith('$ROOT_QUERY.pdpMainInfo') &&
    /\.components\.\d+\.data\.0\.price$/.test(k)
  )
  // ... rest of extraction
}
```

---

## Testing

### Manual Testing

```javascript
// Open DevTools on a Tokopedia product page
// Console:
const cache = window.__cache
console.log('Price:', Object.keys(cache).find(k => k.endsWith('.price')))
console.log('Stock:', Object.keys(cache).find(k => k.endsWith('.stock')))
console.log('BasicInfo:', Object.keys(cache).find(k => k.startsWith('pdpBasicInfo')))
```

### Unit Test Mock

```typescript
const mockCache: TokopediaApolloCache = {
  '$ROOT_QUERY.pdpMainInfo({"productKey":"test"}).components.3.data.0.price': {
    value: 4599000,
    priceFmt: 'Rp4.599.000',
    slashPriceFmt: 'Rp4.649.000',
    discPercentage: '1%',
    __typename: 'pdpContentSnapshotPrice',
  },
  '$ROOT_QUERY.pdpMainInfo({"productKey":"test"}).components.3.data.0.stock': {
    useStock: false,
    value: '7',
    stockWording: '',
    __typename: 'pdpContentSnapshotStock',
  },
  'pdpBasicInfo100314316658': {
    productID: '100314316658',
    shopName: 'Test Store',
    shopID: '12345',
    status: 'ACTIVE',
    __typename: 'pdpBasicInfo',
  },
}

const mockPage = {
  evaluate: async () => mockCache,
  $eval: async () => null,
  url: () => 'https://tokopedia.com/test/product',
}
```

---

## What Has Not Changed

- Difficulty rating remains **Low** — `window.__cache` is stable structured data
- Rate limiting is still lenient. 4–6s delays remain sufficient
- User-Agent and viewport: desktop UA + 1440×900 is still correct
- Price is still integer IDR with no decimals — write directly to the `price_snapshots.price` column

---

## References

- [Tokopedia Help Center](https://www.tokopedia.com/help)
- [Apollo Client Cache](https://www.apollographql.com/docs/react/caching/overview/)
- [Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-rendering/)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-25 | Updated for Zeus framework migration (`window.__cache`) |
| 2026-02-25 | Initial documentation (deprecated `__NEXT_DATA__` approach) |