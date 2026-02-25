/**
 * Scraper Package Types
 *
 * Type definitions for the price refresh workflow and browser rendering.
 */

import type { PuppeteerPage, ScrapedData } from '@pricenesia/adapters'

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Parameters passed to the PriceRefreshWorkflow when triggered.
 */
export interface WorkflowParams {
  /** Platform listing ID to scrape */
  listing_id: number
  /** Platform identifier (e.g., 'tokopedia', 'shopee') */
  platform: string
  /** Product URL to scrape */
  url: string
  /** Optional: Force re-scrape even if recently scraped */
  force?: boolean
}

/**
 * Result of a single workflow run.
 */
export interface WorkflowResult {
  /** Listing ID that was scraped */
  listing_id: number
  /** Whether the scrape was successful */
  success: boolean
  /** Scraped data if successful */
  data?: ScrapedData
  /** Error message if failed */
  error?: string
  /** Timestamp of completion */
  completed_at: string
}

// ============================================================================
// Browser Rendering Types
// ============================================================================

/**
 * Options for browser page rendering.
 */
export interface RenderOptions {
  /** Time to wait for page load in ms */
  timeout?: number
  /** Wait until condition */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
  /** Custom user agent */
  userAgent?: string
  /** Extra HTTP headers */
  headers?: Record<string, string>
  /** Viewport dimensions */
  viewport?: { width: number; height: number }
}

/**
 * Result of browser page rendering.
 */
export interface RenderResult {
  /** Page HTML content */
  html: string
  /** Final URL after redirects */
  finalUrl: string
  /** Time taken in ms */
  duration: number
  /** Page object for further extraction */
  page: PuppeteerPage
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Context for price sanity check validation.
 */
export interface ValidationContext {
  /** Current scraped price */
  current_price: number | null
  /** Previous price from last snapshot */
  previous_price: number | null
  /** Platform identifier */
  platform: string
  /** Minimum acceptable price (floor) */
  price_floor?: number
  /** Maximum allowed price change ratio (e.g., 0.5 = 50%) */
  max_change_ratio?: number
}

/**
 * Result of sanity check validation.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** Reason if invalid */
  reason?: 'zero_price' | 'price_below_floor' | 'change_too_large' | 'parse_error'
  /** Additional debug info */
  debug?: string
}

// ============================================================================
// Environment Types
// ============================================================================

/**
 * Cloudflare Worker bindings for the scraper.
 * 
 * Note: D1Database type comes from @cloudflare/workers-types
 * Browser type comes from @cloudflare/puppeteer
 */
export interface Env {
  /** D1 Database binding */
  DB: D1Database
  /** Browser Rendering binding */
  BROWSER: Fetcher
  /** Workflow binding for self-triggering */
  PRICE_REFRESH_WORKFLOW: Workflow
  /** Environment name */
  ENVIRONMENT: 'development' | 'production'
}