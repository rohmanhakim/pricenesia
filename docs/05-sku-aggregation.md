# SKU Aggregation Strategy

## The Problem

Each platform uses its own internal product identifier. A PS4 Slim 1TB on Tokopedia might be item `123456789`, while the identical product on Shopee is `987654321`. There is no shared universal product ID across Indonesian ecommerce platforms.

Your storefront needs to show one product card with prices from all platforms — so you need a way to group these disparate listings under a single identity.

---

## Strategy: Three-Layer Curation

Since you manually curate products, the most reliable approach is to assert the mapping yourself at ingestion time, then use automated signals to validate and catch mistakes.

### Layer 1: Canonical ID (You Assign This)

When you add a product, you define a `canonical_product_id` — a stable slug that you control:

```
sony-ps4-slim-1tb-cuh2006
samsung-galaxy-s24-256gb-phantom-black
logitech-mx-master-3s-graphite
```

When you then add the Tokopedia listing, the Shopee listing, and the Blibli listing, you attach all three to the same canonical ID. This is the explicit, editorial declaration that these three listings represent the same product.

This is intentional — you're not building a crawler that auto-discovers products. You're building a curated catalog. The editorial step is a feature, not a limitation.

### Layer 2: Model Number Validation (Automated Cross-Check)

For electronics, appliances, and most branded goods, the model number appears in the product title or description. Store it in `canonical_products.model_number` and validate it during scraping:

```ts
// In your platform adapter, after extracting title/description:
function validateModelNumber(scrapedTitle: string, expectedModel: string): boolean {
  if (!expectedModel) return true  // no model to check
  return scrapedTitle.toUpperCase().includes(expectedModel.toUpperCase())
}

// If this returns false, write to flagged_snapshots with flag_reason: 'model_mismatch'
// This catches cases where a seller replaced the product in a listing
```

Examples:
- PS4 Slim → model `CUH-2006A` or `CUH-2006B`
- iPhone 15 Pro → model `A3104`
- Samsung Galaxy S24 → model `SM-S921`

### Layer 3: Seller-Level Pinning (Quality Gate)

You track a specific seller per platform, not just any listing for the product. This means:

- The same seller cannot list two different products under the same URL (common with fake listings)
- Price changes from that seller are expected and trusted
- New sellers for the same product must be explicitly added by you

---

## What You Don't Need

### Fuzzy Name Matching

Automated title matching (Levenshtein distance, TF-IDF, embeddings) is useful when you're crawling at scale and need to auto-discover matches. For a curated catalog of 50–500 products, it adds complexity without meaningful benefit. You're making the matching decision once, manually, at ingestion time.

### Barcode / EAN Lookup

EAN/JAN barcodes are reliable canonical identifiers but Indonesian ecommerce platforms rarely surface them in product pages. Sellers often don't include them, and scraping them is unreliable. Model number extraction achieves the same result for electronics with less fragility.

### Platform Product APIs

Tokopedia, Shopee, and Lazada have affiliate APIs that expose some product data, but they're either restricted, require approval, or don't surface the data you need. Browser scraping gives you more control and works uniformly across all platforms.

---

## Handling Variants

Many products have variants (color, storage size, bundle type). A PS4 might be listed as one product on Tokopedia but with separate SKUs per color variant.

**Recommendation:** Treat each meaningful variant as its own canonical product.

```
sony-ps4-slim-1tb-white
sony-ps4-slim-1tb-black
sony-ps4-slim-500gb-black
```

Avoid trying to model variants within a single canonical product — it complicates your schema and storefront display significantly. The additional canonical products are negligible overhead.

---

## Data Model Reminder

```
canonical_products           (YOUR canonical ID)
       ↑
platform_listings            (per platform, per seller)
  - tokopedia / iBox Official Store
  - shopee    / iBox Official Store
  - blibli    / iBox Official
  - lazada    / iBox LazMall
       ↑
price_snapshots              (daily price per listing)
```

Your storefront query groups `price_snapshots` → `platform_listings` → `canonical_products.id` to produce the multi-platform price card.

---

## Ingestion Checklist (Per New Product)

When adding a new product to the catalog:

1. Define the `canonical_product_id` slug
2. Record the `model_number` if the product has one
3. Find the listing on each target platform from a **trusted seller** (Official Store, Mall tier preferred)
4. Confirm the title includes the model number (manual check)
5. Add each platform listing via the Curation Dashboard → Ingestion API
6. Verify the first-scrape snapshot price looks correct
7. Create redirect links for each listing

This process takes ~5 minutes per product and gives you clean, trustworthy data from day one.
