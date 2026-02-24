# Supporting Components

## 1. Referral Link Redirector

A lightweight Worker at `go.yourdomain.com` that proxies clicks to the real affiliate URL stored in D1. Decouples your storefront links from platform-specific affiliate URLs that can expire or rotate.

### Why This Matters

If you hardcode referral URLs directly in your storefront:
- When Shopee rotates your affiliate token, every Shopee link across your site breaks
- You cannot track which products get the most clicks
- You'd need to redeploy to fix links

With a redirector, you update one D1 row and all links across every page fix instantly.

### Worker Code

```ts
// workers/redirector/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const code = url.pathname.slice(1)  // "go.yourdomain.com/tk-ps4-ibox" → "tk-ps4-ibox"

    if (!code) {
      return Response.redirect('https://yourdomain.com', 301)
    }

    const link = await env.DB.prepare(
      `SELECT target_url FROM redirect_links WHERE id = ?`
    ).bind(code).first<{ target_url: string }>()

    if (!link) {
      return new Response('Not found', { status: 404 })
    }

    // Increment click counter (fire and forget, don't block redirect)
    env.DB.prepare(
      `UPDATE redirect_links SET click_count = click_count + 1 WHERE id = ?`
    ).bind(code).run()

    return Response.redirect(link.target_url, 302)
  }
}
```

### Short Code Convention

Use a human-readable pattern: `{platform_abbr}-{product_slug}-{seller_abbr}`

```
tk-ps4slim-ibox     → Tokopedia, PS4 Slim, iBox Official
sp-ps4slim-ibox     → Shopee, PS4 Slim, iBox Official
bl-ps4slim-samsung  → Blibli, PS4 Slim, Samsung Official
```

### Affiliate URL Rotation

When you receive a new affiliate token from a platform, update the target in D1:

```sql
UPDATE redirect_links
SET target_url = 'https://tokopedia.link/newcode?aff=YOUR_NEW_ID',
    updated_at = datetime('now')
WHERE id = 'tk-ps4slim-ibox';
```

All storefront links using `go.yourdomain.com/tk-ps4slim-ibox` now redirect to the new URL immediately.

---

## 2. Ingestion API

An authenticated Worker endpoint called by the Curation Dashboard when you add a new listing. Handles first-scrape, validation, and seeding the database.

### Endpoints

```
POST   /api/products          → Create canonical product
GET    /api/products          → List all canonical products
GET    /api/products/:id      → Get product details
PATCH  /api/products/:id      → Update product (partial update)
DELETE /api/products/:id      → Soft delete product
POST   /api/listings          → Add a new platform listing
GET    /api/listings/:id      → Get listing details
PATCH  /api/listings/:id     → Update listing (mark inactive, change seller tier)
POST   /api/listings/:id/scrape  → Trigger manual re-scrape of a specific listing
```

### Authentication

Use a static API key stored as a Worker secret. The Curation Dashboard sends it in the header.

```ts
function authenticate(request: Request, env: Env): boolean {
  const key = request.headers.get('X-API-Key')
  return key === env.ADMIN_API_KEY
}
```

### Add Listing Flow

```ts
// POST /api/listings
async function addListing(body: AddListingRequest, env: Env) {
  const { canonical_product_id, platform, raw_url, seller_name, seller_tier } = body

  // 1. Validate canonical product exists
  const product = await env.DB.prepare(
    `SELECT id, model_number FROM canonical_products WHERE id = ?`
  ).bind(canonical_product_id).first()

  if (!product) throw new Error('Canonical product not found')

  // 2. Create listing record
  const listingId = crypto.randomUUID()
  const redirectCode = generateRedirectCode(platform, canonical_product_id, seller_name)

  await env.DB.prepare(`
    INSERT INTO platform_listings
      (id, canonical_product_id, platform, raw_url, seller_name, seller_tier, is_active, is_pinned_seller)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
  `).bind(listingId, canonical_product_id, platform, raw_url, seller_name, seller_tier).run()

  // 3. Create redirect link
  await env.DB.prepare(`
    INSERT INTO redirect_links (id, listing_id, target_url)
    VALUES (?, ?, ?)
  `).bind(redirectCode, listingId, raw_url).run()  // target_url updated after affiliate URL injection

  // 4. Trigger first-scrape (async, don't block response)
  env.PRICE_REFRESH_WORKFLOW.create({ listing_id: listingId })

  return { listing_id: listingId, redirect_code: redirectCode }
}
```

---

## 3. Health Monitor

A Worker that runs after the daily scrape (or on a separate cron) and checks for signs of scraper failure or data quality issues. Sends alerts to Telegram or email.

### Trigger

```toml
[triggers]
crons = ["30 19 * * *"]  # 30 minutes after main scrape at 2:30AM WIB
```

### Checks

```ts
async function runHealthChecks(env: Env) {
  const alerts: string[] = []
  const yesterday = new Date(Date.now() - 86400000).toISOString()

  // Check 1: Listings that weren't scraped today
  const stale = await env.DB.prepare(`
    SELECT pl.id, pl.platform, pl.seller_name, cp.name
    FROM platform_listings pl
    JOIN canonical_products cp ON cp.id = pl.canonical_product_id
    WHERE pl.is_active = 1
      AND (pl.last_scraped_at IS NULL OR pl.last_scraped_at < ?)
  `).bind(yesterday).all()

  if (stale.results.length > 0) {
    alerts.push(`⚠️ ${stale.results.length} listings not scraped today:\n` +
      stale.results.map(r => `  - ${r.name} (${r.platform})`).join('\n'))
  }

  // Check 2: High volume of flagged snapshots
  const flagged = await env.DB.prepare(`
    SELECT COUNT(*) as count, flag_reason
    FROM flagged_snapshots
    WHERE scraped_at > ?
    GROUP BY flag_reason
  `).bind(yesterday).all()

  const totalFlagged = flagged.results.reduce((sum, r: any) => sum + r.count, 0)
  if (totalFlagged > 5) {
    alerts.push(`🚨 ${totalFlagged} flagged snapshots today:\n` +
      flagged.results.map((r: any) => `  - ${r.flag_reason}: ${r.count}`).join('\n'))
  }

  // Check 3: Platform-specific failure rate
  const platformStats = await env.DB.prepare(`
    SELECT
      pl.platform,
      COUNT(DISTINCT pl.id) as total_listings,
      COUNT(DISTINCT ps.listing_id) as scraped_today
    FROM platform_listings pl
    LEFT JOIN price_snapshots ps ON ps.listing_id = pl.id AND ps.scraped_at > ?
    WHERE pl.is_active = 1
    GROUP BY pl.platform
  `).bind(yesterday).all()

  for (const stat of platformStats.results as any[]) {
    const failRate = 1 - (stat.scraped_today / stat.total_listings)
    if (failRate > 0.3) {
      alerts.push(`❌ ${stat.platform}: ${Math.round(failRate * 100)}% failure rate (${stat.scraped_today}/${stat.total_listings} scraped)`)
    }
  }

  if (alerts.length > 0) {
    await sendTelegramAlert(alerts.join('\n\n'), env)
  }
}
```

### Telegram Alert

```ts
async function sendTelegramAlert(message: string, env: Env) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: `[Price Tracker Health]\n\n${message}`,
      parse_mode: 'HTML'
    })
  })
}
```

---

## 4. Price Alert System

Runs after the daily scrape, diffs today's prices against yesterday's, and notifies you when a tracked product drops significantly. Useful for knowing when to share/promote a deal.

### Worker Logic

```ts
async function runPriceAlerts(env: Env) {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // Get today's and yesterday's prices for all listings
  const drops = await env.DB.prepare(`
    WITH today_prices AS (
      SELECT listing_id, price
      FROM price_snapshots
      WHERE date(scraped_at) = date('now')
        AND rowid IN (
          SELECT MAX(rowid) FROM price_snapshots
          WHERE date(scraped_at) = date('now')
          GROUP BY listing_id
        )
    ),
    yesterday_prices AS (
      SELECT listing_id, price
      FROM price_snapshots
      WHERE date(scraped_at) = date('now', '-1 day')
        AND rowid IN (
          SELECT MAX(rowid) FROM price_snapshots
          WHERE date(scraped_at) = date('now', '-1 day')
          GROUP BY listing_id
        )
    )
    SELECT
      cp.name,
      pl.platform,
      pl.seller_name,
      yp.price as price_yesterday,
      tp.price as price_today,
      ROUND((yp.price - tp.price) * 100.0 / yp.price, 1) as drop_pct
    FROM today_prices tp
    JOIN yesterday_prices yp ON yp.listing_id = tp.listing_id
    JOIN platform_listings pl ON pl.id = tp.listing_id
    JOIN canonical_products cp ON cp.id = pl.canonical_product_id
    WHERE tp.price < yp.price * 0.85  -- alert on 15%+ drops
    ORDER BY drop_pct DESC
  `).all()

  if (drops.results.length === 0) return

  const message = drops.results.map((d: any) =>
    `📉 ${d.name} (${d.platform})\n` +
    `   Rp ${d.price_yesterday.toLocaleString()} → Rp ${d.price_today.toLocaleString()} (-${d.drop_pct}%)`
  ).join('\n\n')

  await sendTelegramAlert(`Price Drops Today:\n\n${message}`, env)
}
```

---

## Wrangler Config Summary

```toml
name = "price-tracker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "price-tracker-db"
database_id = "your-d1-database-id"

[[browser]]
binding = "BROWSER"

[[workflows]]
name = "daily-price-refresh"
binding = "PRICE_REFRESH_WORKFLOW"
class_name = "PriceRefreshWorkflow"

[[workflows]]
name = "health-monitor"
binding = "HEALTH_MONITOR_WORKFLOW"
class_name = "HealthMonitorWorkflow"

[triggers]
crons = [
  "0 19 * * *",   # 2:00 AM WIB — main scrape
  "30 19 * * *"   # 2:30 AM WIB — health check + price alerts
]

[vars]
ENVIRONMENT = "production"

# Secrets (set via wrangler secret put):
# ADMIN_API_KEY
# TELEGRAM_BOT_TOKEN
# TELEGRAM_CHAT_ID
```
