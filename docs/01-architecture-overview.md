# JejakHarga: Indonesian Ecommerce Referral Aggregator — Architecture Overview

## System Purpose

JejakHarga is a curated price aggregation and referral platform targeting Indonesian ecommerce marketplaces (Tokopedia, Shopee, Blibli, Lazada, TikTok Shop). The system scrapes prices daily from manually curated product listings, injects affiliate referral URLs, stores historical price data, and serves it through a public storefront acting as a price tracker and cross-platform comparer.

---

## Components

| Component | Role |
|---|---|
| **Ingestion API** | Authenticated entry point for adding new listings |
| **Daily Scrape Workflow** | Durable scheduled job that refreshes all prices |
| **Browser Rendering Workers** | Headless Chrome execution for scraping JS-heavy platforms |
| **Referral Link Redirector** | Short URL proxy that injects and manages affiliate links |
| **Database (D1)** | Stores canonical products, listings, and price snapshots |
| **Curation Dashboard** | Internal UI to manage products, sellers, and listings |
| **Storefront** | Public-facing price comparison and tracker UI |
| **Health Monitor** | Alerts when scrapers fail or prices behave anomalously |
| **Price Alert System** | Notifies when a tracked item drops significantly |

---

## Data Flow

```
[You] → Curation Dashboard → Ingestion API
                                    ↓
                           First-scrape Worker (Browser Rendering)
                                    ↓
                              D1 Database (seed listing + first price snapshot)

[Cron: Daily 2AM WIB] → Scrape Workflow
                                    ↓
                     For each active listing (sequential, ~5s delay):
                           Browser Rendering Worker
                                    ↓
                           Platform Adapter (parse price, stock)
                                    ↓
                           Sanity Check (price validation)
                                    ↓
                     ┌─────────────┴──────────────┐
                  PASS                           FAIL
                    ↓                              ↓
            price_snapshots table         flagged_snapshots table
                                               ↓
                                        Health Monitor Alert

[User] → Storefront Worker → D1 (query by canonical_product_id)
              ↓
     Referral Link Redirector → Platform Referral URL
```

---

## Component Interaction Map

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Network                      │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  Curation    │    │  Storefront  │    │  Redirector   │  │
│  │  Dashboard   │    │  Worker      │    │  Worker       │  │
│  └──────┬───────┘    └──────┬───────┘    └───────┬───────┘  │
│         │                   │                    │          │
│  ┌──────▼───────┐           │                    │          │
│  │  Ingestion   │           │                    │          │
│  │  API Worker  │           │                    │          │
│  └──────┬───────┘           │                    │          │
│         │                   │                    │          │
│  ┌──────▼───────────────────▼────────────────────▼────────┐ │
│  │                      D1 Database                       │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                 │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │              Daily Scrape Workflow                     │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                 │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │            Browser Rendering Workers                   │ │
│  │     (Tokopedia / Shopee / Blibli / Lazada / TikTok)    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Design Principles

**Curated, not crawled.** You manually select products and trusted sellers. The system does not discover products automatically. This keeps data quality high and avoids fake listings.

**Daily cadence is sufficient.** Price freshness of ~24 hours is acceptable. This removes pressure for concurrency or aggressive scraping, keeps platform relations clean, and simplifies the Workflow design.

**Seller-level pinning.** Listings are tied to a specific seller on each platform, not just a product category. This filters out fake/inflated listings by only tracking sellers you explicitly trust.

**Sanity-checked writes.** Price snapshots are validated before writing. Anomalous values go to a separate flagged table; yesterday's price continues to be served until manually reviewed.

**Referral URL decoupling.** Affiliate links are served through your own redirector, not hardcoded in the storefront. This allows link updates without redeployment and enables click tracking.
