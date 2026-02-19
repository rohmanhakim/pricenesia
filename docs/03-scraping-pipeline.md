# Scraping Pipeline — Workers, Workflows & Browser Rendering

## Overview

The scraping pipeline runs once daily as a Cloudflare Workflow. It fetches all active pinned listings from D1, visits each product URL using Browser Rendering (headless Chromium), extracts price and stock data via platform-specific adapters, validates the result, and writes a snapshot to D1.

---

## Cloudflare Services Used

| Service | Role |
|---|---|
| **Workflows** | Durable orchestration, retry handling, cron trigger |
| **Browser Rendering** | Headless Chromium for JS-rendered pages |
| **Workers** | Platform adapter logic, D1 reads/writes |
| **D1** | Database for listings and snapshots |
| **Durable Objects** | (Optional) Warm browser session reuse per platform |

---

## Workflow Design

### Trigger

```toml
# wrangler.toml
[[workflows]]
name = "daily-price-refresh"
binding = "PRICE_REFRESH_WORKFLOW"
class_name = "PriceRefreshWorkflow"

[triggers]
crons = ["0 19 * * *"]  # 2AM WIB = 19:00 UTC
```

### Workflow Steps

```ts
export class PriceRefreshWorkflow extends WorkflowEntrypoint {
  async run(event: WorkflowEvent, step: WorkflowStep) {

    // Step 1: Fetch all active listings
    const listings = await step.do('fetch-listings', async () => {
      const result = await this.env.DB.prepare(`
        SELECT pl.*, cp.model_number, cp.name as product_name
        FROM platform_listings pl
        JOIN canonical_products cp ON cp.id = pl.canonical_product_id
        WHERE pl.is_active = 1 AND pl.is_pinned_seller = 1 AND cp.is_active = 1
        ORDER BY pl.platform, pl.last_scraped_at ASC NULLS FIRST
      `).all()
      return result.results
    })

    // Step 2..N: Scrape each listing sequentially
    for (const listing of listings) {
      await step.do(`scrape-${listing.id}`, async () => {
        // Jitter delay: 4-8 seconds between each request
        await sleep(4000 + Math.random() * 4000)

        const snapshot = await scrapeListingWithBrowser(listing, this.env)

        if (snapshot.valid) {
          await writeSnapshot(listing.id, snapshot, this.env.DB)
        } else {
          await writeFlaggedSnapshot(listing.id, snapshot, this.env.DB)
        }

        await this.env.DB.prepare(
          `UPDATE platform_listings SET last_scraped_at = ? WHERE id = ?`
        ).bind(new Date().toISOString(), listing.id).run()
      })
    }
  }
}
```

**Why sequential?** At ~50 curated products × 5 platforms = 250 listings, sequential scraping with ~6s average delay = ~25 minutes. Well within Workflow limits, and conservative enough that no platform will flag the traffic.

---

## Browser Rendering Integration

```ts
async function scrapeListingWithBrowser(listing: Listing, env: Env) {
  const browser = await puppeteer.launch(env.BROWSER)

  try {
    const page = await browser.newPage()

    // Set realistic headers
    await page.setUserAgent(getPlatformUserAgent(listing.platform))
    await page.setViewport({ width: 390, height: 844 })  // iPhone viewport for Shopee/TikTok
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'id-ID,id;q=0.9' })

    await page.goto(listing.raw_url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })

    // Delegate to platform adapter
    const adapter = getAdapter(listing.platform)
    const data = await adapter.extract(page, listing)

    return data
  } finally {
    await browser.close()
  }
}
```

---

## Platform Adapters

Each platform exports the same interface:

```ts
interface PlatformAdapter {
  extract(page: Page, listing: Listing): Promise<ScrapedData>
}

interface ScrapedData {
  price: number | null
  original_price: number | null
  stock_status: 'available' | 'limited' | 'out_of_stock' | null
  seller_name: string | null
  valid: boolean
  flag_reason?: string
  raw_debug?: string
}
```

### Tokopedia Adapter

Tokopedia embeds a JSON blob in `<script id="__NEXT_DATA__">` — parse this first before touching the DOM. Much faster and more reliable than DOM scraping.

```ts
export const TokopediaAdapter: PlatformAdapter = {
  async extract(page, listing) {
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__')
      return el ? JSON.parse(el.textContent || '{}') : null
    })

    // Path varies by page type — inspect in DevTools to confirm
    const product = nextData?.props?.pageProps?.layoutData?.pdpGetLayout?.basicInfo
    const price = product?.txStats?.countSold  // adjust path per actual structure

    // Fallback to DOM if JSON path changes
    if (!price) {
      const domPrice = await page.$eval(
        '[data-testid="lblPDPDetailProductPrice"]',
        el => el.textContent
      ).catch(() => null)
      // parse domPrice...
    }

    return { price, original_price: null, stock_status: 'available', seller_name: null, valid: !!price }
  }
}
```

**Difficulty: Low.** `__NEXT_DATA__` is very stable. Rarely breaks.

---

### Shopee Adapter

Shopee is client-side rendered and anti-bot aware. Requires full JS execution. Use mobile viewport.

```ts
export const ShopeeAdapter: PlatformAdapter = {
  async extract(page, listing) {
    // Wait for price element to render
    await page.waitForSelector('[class*="priceSectionWrapper"]', { timeout: 15000 })
      .catch(() => null)

    const data = await page.evaluate(() => {
      // Shopee injects product data into window.__NEXT_DATA__ or window.pageData
      const raw = (window as any).__NEXT_DATA__?.props?.pageProps?.initialState?.pdp?.data
      return {
        price: raw?.price / 100000,  // Shopee stores price * 100000
        original_price: raw?.price_before_discount / 100000,
        stock: raw?.stock,
        seller: raw?.shop_name
      }
    })

    return {
      price: data.price,
      original_price: data.original_price || null,
      stock_status: data.stock > 0 ? 'available' : 'out_of_stock',
      seller_name: data.seller,
      valid: !!data.price
    }
  }
}
```

**Difficulty: High.** Expect this to break periodically. Monitor flagged_snapshots for Shopee failures.

---

### Blibli Adapter

```ts
export const BlibliAdapter: PlatformAdapter = {
  async extract(page, listing) {
    await page.waitForSelector('[data-testid="product-price"]', { timeout: 10000 })

    const price = await page.$eval(
      '[data-testid="product-price"]',
      el => el.textContent?.replace(/[^0-9]/g, '')
    ).catch(() => null)

    const stockEl = await page.$('[data-testid="stock-status"]')
    const stockText = await stockEl?.evaluate(el => el.textContent) ?? ''

    return {
      price: price ? parseInt(price) : null,
      original_price: null,
      stock_status: stockText.toLowerCase().includes('habis') ? 'out_of_stock' : 'available',
      seller_name: null,
      valid: !!price
    }
  }
}
```

**Difficulty: Medium.** Relatively stable DOM, moderate bot detection.

---

### Lazada Adapter

Lazada uses Akamai bot protection. Keep requests slow and sessions warm.

```ts
export const LazadaAdapter: PlatformAdapter = {
  async extract(page, listing) {
    // Lazada injects product JSON into a script tag
    const productData = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'))
      const dataScript = scripts.find(s => s.textContent?.includes('window.pageData'))
      if (!dataScript) return null
      // Extract JSON from script content
      const match = dataScript.textContent?.match(/window\.pageData\s*=\s*(\{.+\});/)
      return match ? JSON.parse(match[1]) : null
    })

    const price = productData?.mods?.listingInfo?.price
    return {
      price: price ? parseFloat(price) : null,
      original_price: null,
      stock_status: 'available',
      seller_name: productData?.mods?.seller?.name ?? null,
      valid: !!price
    }
  }
}
```

**Difficulty: High.** Akamai fingerprinting is aggressive. Use session reuse via Durable Objects.

---

### TikTok Shop Adapter

Treat as Phase 2. DOM structure is less stable and affiliate program terms differ.

```ts
export const TikTokShopAdapter: PlatformAdapter = {
  async extract(page, listing) {
    await page.waitForSelector('[data-e2e="product-price"]', { timeout: 15000 }).catch(() => null)

    const price = await page.$eval(
      '[data-e2e="product-price"]',
      el => el.textContent?.replace(/[^0-9]/g, '')
    ).catch(() => null)

    return {
      price: price ? parseInt(price) : null,
      original_price: null,
      stock_status: null,
      seller_name: null,
      valid: !!price,
      flag_reason: !price ? 'parse_error' : undefined
    }
  }
}
```

---

## Price Sanity Check

Run this before any snapshot write:

```ts
function validateSnapshot(
  newPrice: number | null,
  lastKnownPrice: number | null,
  platform: string
): { valid: boolean; flag_reason?: string } {
  if (!newPrice || newPrice <= 0) {
    return { valid: false, flag_reason: 'zero_price' }
  }

  // IDR floor — nothing legitimate costs less than Rp 10,000
  if (newPrice < 10_000) {
    return { valid: false, flag_reason: 'price_below_floor' }
  }

  // If we have a baseline, check for suspicious swings
  if (lastKnownPrice) {
    const changeRatio = Math.abs(newPrice - lastKnownPrice) / lastKnownPrice

    // Electronics: flag if >40% change in one day
    // Adjust per category if needed
    const threshold = platform === 'tokopedia' ? 0.5 : 0.4
    if (changeRatio > threshold) {
      return { valid: false, flag_reason: `change_too_large:${(changeRatio * 100).toFixed(0)}pct` }
    }
  }

  return { valid: true }
}
```

---

## Platform Selector

```ts
function getAdapter(platform: string): PlatformAdapter {
  const adapters: Record<string, PlatformAdapter> = {
    tokopedia: TokopediaAdapter,
    shopee: ShopeeAdapter,
    blibli: BlibliAdapter,
    lazada: LazadaAdapter,
    tiktokshop: TikTokShopAdapter,
  }
  return adapters[platform] ?? TokopediaAdapter
}

function getPlatformUserAgent(platform: string): string {
  // Use mobile UA for Shopee and TikTok, desktop for others
  if (['shopee', 'tiktokshop'].includes(platform)) {
    return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}
```
