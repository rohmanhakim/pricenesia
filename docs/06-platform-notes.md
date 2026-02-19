# Platform Notes & Anti-Detection

## Platform Difficulty Matrix

| Platform | Bot Detection | JS Rendering | Data Source | Recommended Delay |
|---|---|---|---|---|
| Tokopedia | Low | Next.js SSR | `__NEXT_DATA__` JSON | 4–6s |
| Shopee | High | Full CSR | `window.__NEXT_DATA__` / DOM | 8–15s |
| Blibli | Medium | React SPA | DOM | 5–8s |
| Lazada | High | React + Akamai | `window.pageData` script | 10–20s |
| TikTok Shop | Medium | React | DOM | 8–12s |

---

## Platform-Specific Notes

### Tokopedia

**Affiliate Program:** Tokopedia Affiliate (TokoAffiliate)
**Link Format:** `https://tokopedia.link/{code}` or appending `?aff_unique_id={YOUR_ID}`
**Seller Trust Tiers:** Gold Badge = Official Store (highest trust)

**Scraping Notes:**
- Most reliable platform. `__NEXT_DATA__` JSON contains complete product data.
- Inspect `props.pageProps.layoutData` — path varies slightly between product types (physical vs digital).
- Price is usually in the `pdpGetLayout` or similar node. Inspect in DevTools once and the path is stable for months.
- Stock status (`stockWording`) is also in the JSON blob.
- Rate limiting is lenient. Even 3–4s delays are sufficient.

**Watch for:** Tokopedia sometimes has `price: 0` in the JSON when a product is flash-sale locked. Check `campaign_price` or `original_price` fields as fallback.

---

### Shopee

**Affiliate Program:** Shopee Affiliate Program
**Link Format:** `https://shp.ee/{code}` (shortened) or `https://shopee.co.id/...?af_click_lookback=...`
**Seller Trust Tiers:** Shopee Mall = highest trust

**Scraping Notes:**
- Fully client-side rendered. Browser Rendering is mandatory.
- Use **mobile viewport** (390×844, iPhone UA) — mobile web is simpler, less protected than desktop.
- Price is multiplied by 100000 in the internal API. `49500000` in raw data = Rp 495.000.
- Shopee's DOM class names are hashed (e.g. `_3-ofR`) and change with frontend deployments. Avoid relying on class names; use data attributes or the JS data layer instead.
- CAPTCHA appears occasionally — your flagged_snapshots monitor will catch these as `parse_error`.
- Session warmup helps: load the homepage before navigating to product page.

**Watch for:** Shopee often shows a "flash price" that's only valid for logged-in users. If you see a price suspiciously lower than other platforms, this may be the cause. The `price` vs `price_before_discount` fields clarify this.

---

### Blibli

**Affiliate Program:** Blibli Affiliate (via ShareASale or direct)
**Link Format:** `https://www.blibli.com/p/...?af={YOUR_CODE}`
**Seller Trust Tiers:** Blibli Official Store, Blibli Mart

**Scraping Notes:**
- Medium difficulty. React SPA but less aggressive anti-bot than Shopee/Lazada.
- Product data is available in both DOM and a JSON hydration script.
- `data-testid` attributes are more stable than class names for DOM selectors.
- Stock is expressed in Indonesian: "Stok Habis" = out of stock, "Tersedia" = available.

---

### Lazada

**Affiliate Program:** Lazada Affiliate Program
**Link Format:** `https://www.lazada.co.id/...?cid={YOUR_CID}&spm=...`
**Seller Trust Tiers:** LazMall = highest trust

**Scraping Notes:**
- Akamai Bot Manager is active. It fingerprints TLS, JS execution patterns, and mouse behavior.
- Browser Rendering helps significantly since it's real Chromium, not a headless signature.
- Use **Durable Objects to maintain warm sessions** — cold browser starts on Lazada are more likely to trigger bot detection.
- Product JSON is often embedded in a `<script>` tag as `window.pageData = {...}`. This is more reliable than DOM scraping.
- Add a realistic delay of 10–20 seconds, and consider loading the Lazada homepage before the product page within the same session.
- Don't run all Lazada listings back-to-back; interleave with other platforms.

**Watch for:** Lazada sometimes serves a "product not found" page for valid URLs if bot detection triggers. Your scraper should detect HTTP 404 vs successful page load and handle accordingly.

---

### TikTok Shop

**Affiliate Program:** TikTok Affiliate (via TikTok Seller Center)
**Link Format:** `https://vt.tiktok.com/{code}` or `https://shop.tiktok.com/...?aff_id={YOUR_ID}`
**Seller Trust Tiers:** Brand Official Account

**Scraping Notes:**
- Treat as **Phase 2**. The web presence (`shop.tiktok.com`) is less mature than the app.
- DOM structure changes more frequently than other platforms.
- Affiliate links are generated per-session in the app, making programmatic URL construction harder.
- Consider scraping `m.tiktok.com` (mobile web) which is simpler.
- TikTok Shop prices are typically competitive — worth adding when the other four are stable.

---

## Anti-Detection Practices

### Session Warmup

For Shopee and Lazada, don't navigate directly to a product URL from a cold browser. Load the homepage first, wait 2–3 seconds, then navigate. This mimics human browsing behavior.

```ts
await page.goto('https://shopee.co.id', { waitUntil: 'networkidle2' })
await sleep(2000 + Math.random() * 1000)
await page.goto(listing.raw_url, { waitUntil: 'networkidle2' })
```

### Request Jitter

Never scrape at fixed intervals. Add random jitter to all delays:

```ts
const baseDelay = getPlatformBaseDelay(platform)  // e.g. 8000ms for Shopee
const jitter = Math.random() * baseDelay * 0.5    // ±50% jitter
await sleep(baseDelay + jitter)
```

### User-Agent & Viewport

```ts
// Mobile for Shopee + TikTok
const mobileUA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36'
const mobileViewport = { width: 390, height: 844, isMobile: true }

// Desktop for Tokopedia, Blibli, Lazada
const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'
const desktopViewport = { width: 1440, height: 900 }
```

### Durable Objects for Session Reuse

For Lazada especially, reusing a browser session across multiple product page visits within a scrape run is better than cold-starting a new browser per URL. See Cloudflare's [Browser Rendering with Durable Objects](https://developers.cloudflare.com/browser-rendering/workers-bindings/browser-rendering-with-do/) guide.

### Scrape Order

Don't group all Shopee scrapes together or all Lazada scrapes together. Interleave platforms within the Workflow run:

```
Tokopedia listing 1
Shopee listing 1
Blibli listing 1
Lazada listing 1
Tokopedia listing 2
Shopee listing 2
...
```

This distributes request load across platforms and avoids burst patterns that trigger rate limiting.

---

## Failure Modes to Monitor

| Symptom | Likely Cause | Action |
|---|---|---|
| `price: null` for all Shopee listings | DOM class names changed | Update Shopee adapter selectors |
| `change_too_large` flags on Lazada | Akamai blocking, returning wrong page | Check raw_html in flagged_snapshots |
| Workflow times out | Too many listings, or slow pages | Increase step timeout, reduce listing count |
| `price_below_floor` on Tokopedia | Flash sale locking, JS not fully rendered | Add longer `waitUntil` timeout |
| All platforms fail same day | Cloudflare Browser Rendering outage | Check Cloudflare status page |
