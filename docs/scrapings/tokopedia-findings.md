# Tokopedia PDP Scraping — Research Findings & Updated Adapter

> Document date: February 2026 | Based on live HTML snapshot analysis

---

## 1. Key Finding: `__NEXT_DATA__` is Gone

The original architecture doc and Tokopedia adapter were written assuming Tokopedia runs on **Next.js**, which serialises SSR data into a `<script id="__NEXT_DATA__">` tag. A live HTML snapshot of the Tokopedia PDP (February 2026) confirms this is **no longer the case**.

> ⚠️ **Tokopedia has migrated to a custom framework called Zeus.** Product data is now stored in `window.__cache` — an Apollo Client normalised cache — serialised inside a large inline `<script>` tag. There is no `__NEXT_DATA__` element on the page.

---

## 2. Framework Identification

Several signals in the HTML confirm the Zeus migration:

| Signal | Value |
|---|---|
| `window.__service` | `"zeus"` |
| `window.__SHELL_REVISION__` | `"SSR"` |
| `window.__PAGE_TYPE__` | `"productdetailpage-desktop"` |
| JS bundle path prefix | `tokopedia-web-sg/zeus_v2/...` |
| Data container | `window.__cache` (Apollo store) |
| `__NEXT_DATA__` present? | **No** |

---

## 3. Where Product Data Lives

All product data is stored in `window.__cache`, which is a normalised Apollo Client store. The object is serialised as a plain JSON assignment in script 4 (the largest inline script, ~134 KB). Keys are flattened Apollo references.

### 3.1 Extraction Pattern

The correct extraction approach in Puppeteer:

```ts
const cache = await page.evaluate(() => (window as any).__cache ?? null);

// Find the price key dynamically — the full key includes the product slug,
// so never hardcode it. Scan by suffix instead.
const priceKey = Object.keys(cache).find(k =>
  k.startsWith('$ROOT_QUERY.pdpMainInfo') &&
  k.endsWith('.components.3.data.0.price')
);

const priceObj  = cache[priceKey];
const stockObj  = cache[priceKey.replace('.price', '.stock')];
const basicInfo = cache[Object.keys(cache).find(k => k.startsWith('pdpBasicInfo'))];
```

### 3.2 Price Object

Found at: `window.__cache["$ROOT_QUERY.pdpMainInfo({...}).components.3.data.0.price"]`

| Field | Example Value | Notes |
|---|---|---|
| `value` | `4599000` | Sale price — integer IDR, ready to write directly to DB |
| `priceFmt` | `"Rp4.599.000"` | Formatted string for display only |
| `slashPriceFmt` | `"Rp4.649.000"` | Original/crossed-out price — parse digits to get integer |
| `discPercentage` | `"1%"` | Discount label string |
| `__typename` | `"pdpContentSnapshotPrice"` | Apollo type name |

> 💡 `slashPriceFmt` is the `original_price` equivalent (the crossed-out "was" price). Strip non-digits to get the integer: `parseInt(slashPriceFmt.replace(/[^0-9]/g, ''))`.

### 3.3 Stock Object

Found at: `window.__cache["$ROOT_QUERY.pdpMainInfo({...}).components.3.data.0.stock"]`

| Field | Example Value | Notes |
|---|---|---|
| `useStock` | `false` | When false, seller does not track stock — treat as available |
| `value` | `"7"` | Stock count string. Only meaningful when `useStock` is true |
| `stockWording` | `""` | Display label (e.g. `"Stok Terbatas"`). Empty = no wording shown |
| `__typename` | `"pdpContentSnapshotStock"` | Apollo type name |

### 3.4 Basic Product Info

Found at: `window.__cache["pdpBasicInfo{productID}"]`  _(key prefix is stable, suffix is the numeric product ID)_

| Field | Example Value | Notes |
|---|---|---|
| `productID` | `"100314316658"` | Tokopedia's internal product ID |
| `shopName` | `"Coocaa Indonesia Official"` | Seller name at scrape time |
| `shopID` | `"74945..."` | Numeric shop ID — stable even if name changes |
| `status` | `"ACTIVE"` | Product status. Check for `DELETED` / `INACTIVE` to detect delisted products |
| `isOS` _(on `components.3.data.0`)_ | `true` | Official Store flag — validate seller tier |
| `isPowerMerchant` _(on `components.3.data.0`)_ | `true` | Power Merchant badge |

### 3.5 Product Name

The product name is **not** in the `basicInfo` node. It is in `window.__cache["$ROOT_QUERY.pdpMainInfo({...}).components.3.data.0"].name` — the same node that references the price and stock objects.

```ts
const comp3Key = Object.keys(cache).find(k =>
  k.startsWith('$ROOT_QUERY.pdpMainInfo') &&
  k.endsWith('.components.3.data.0') &&
  !k.includes('price') && !k.includes('stock') && !k.includes('campaign')
);
const productName = comp3Key ? cache[comp3Key].name : null;
```

---

## 4. Updated Tokopedia Adapter

Drop-in replacement for the existing `TokopediaAdapter`. The interface (`ScrapedData` shape) is unchanged.

```ts
export const TokopediaAdapter: PlatformAdapter = {
  async extract(page, listing) {
    const cache = await page.evaluate(() => (window as any).__cache ?? null)

    if (!cache) {
      return {
        price: null, original_price: null, stock_status: null,
        seller_name: null, valid: false, flag_reason: 'parse_error'
      }
    }

    // Price — scan by suffix since product slug is embedded in the key
    const priceKey = Object.keys(cache).find(k =>
      k.startsWith('$ROOT_QUERY.pdpMainInfo') &&
      k.endsWith('.components.3.data.0.price')
    )
    const priceObj = priceKey ? cache[priceKey] : null

    // Stock — same key path, different suffix
    const stockKey = priceKey?.replace('.price', '.stock')
    const stockObj = stockKey ? cache[stockKey] : null

    // Basic info (shopName, status, productID)
    const basicKey = Object.keys(cache).find(k => k.startsWith('pdpBasicInfo'))
    const basicInfo = basicKey ? cache[basicKey] : null

    // Product name
    const comp3Key = Object.keys(cache).find(k =>
      k.startsWith('$ROOT_QUERY.pdpMainInfo') &&
      k.endsWith('.components.3.data.0') &&
      !k.includes('price') && !k.includes('stock') &&
      !k.includes('campaign') && !k.includes('variant')
    )

    const price = priceObj?.value ?? null

    // Slash price = original before discount. Strip formatting to get integer.
    const originalPrice = priceObj?.slashPriceFmt
      ? parseInt(priceObj.slashPriceFmt.replace(/[^0-9]/g, ''))
      : null

    // useStock:false = stock not tracked (common for Official Stores) = available
    const stockStatus: ScrapedData['stock_status'] =
      stockObj?.useStock === false
        ? 'available'
        : parseInt(stockObj?.value ?? '0') > 0
          ? 'available'
          : 'out_of_stock'

    // Validate product is still active
    if (basicInfo?.status && basicInfo.status !== 'ACTIVE') {
      return {
        price: null, original_price: null, stock_status: 'out_of_stock',
        seller_name: basicInfo.shopName ?? null,
        valid: false, flag_reason: 'parse_error'
      }
    }

    return {
      price,
      original_price: originalPrice || null,
      stock_status: stockStatus,
      seller_name: basicInfo?.shopName ?? null,
      valid: !!price && price > 0
    }
  }
}
```

---

## 5. Failure Modes & Monitoring

Update your `flagged_snapshots` monitoring to account for these new failure modes:

| Symptom | Likely Cause | Action |
|---|---|---|
| `window.__cache` is null | Zeus not fully rendered, or bot detection triggered | Add `waitUntil: 'networkidle2'` + 2s extra sleep before extracting |
| No key matching `.components.3.data.0.price` | Component index changed (e.g. 3 → 4 after A/B test) | Widen search: scan all component indices, not just `.3.` |
| `price = 0` on `priceObj.value` | Flash sale or campaign lock (known Tokopedia behaviour) | Check `campaign` node for `campaignPrice` fallback |
| `basicInfo.status = 'DELETED'` | Product delisted by seller | Flag as `parse_error` and alert — listing needs review |

> ⚠️ The `components.3` index is not guaranteed forever. If Tokopedia adds a new layout component above it, the price component may shift. Consider scanning all `components.N.data.0.price` keys if the `.3` suffix stops returning results.

---

## 6. What Has Not Changed

- Difficulty rating for Tokopedia remains **Low** — `window.__cache` is stable structured data, just like `__NEXT_DATA__` was.
- Rate limiting is still lenient. 4–6s delays remain sufficient.
- User-Agent and viewport: desktop UA + 1440×900 is still correct.
- The referral URL format (`tokopedia.link` / `?aff_unique_id=`) is unchanged.
- Price is still integer IDR with no decimals — write directly to the `price_snapshots.price` column.

---

## 7. Snapshot Product Reference

The HTML snapshot used for this analysis was from the following product listing:

| Field | Value |
|---|---|
| Product | COOCAA Y65 50" 4K Google TV (50Y65) |
| Shop | Coocaa Indonesia Official |
| Product ID | `100314316658` |
| Sale Price | Rp 4,599,000 |
| Original Price | Rp 4,649,000 (`slashPriceFmt`) |
| Stock | `useStock: false` → treated as `'available'` |
| `isOS` / Official Store | `true` |
