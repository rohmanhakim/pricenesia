/**
 * Price Refresh Workflow
 *
 * Durable workflow for scraping product prices with automatic retries,
 * browser rendering, and validation.
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import { Effect } from 'effect'
import { runExtractionSafe } from '@pricenesia/adapters'
import type { Platform } from '@pricenesia/shared/types'
import { renderPageForPlatform } from '../browser'
import { validatePrice, createValidationContext } from '../validation'
import { 
  insertPriceSnapshot, 
  findLatestPriceForListing,
  updateListingScrapedAt,
} from '@pricenesia/shared/db'
import type { Env, WorkflowParams, WorkflowResult } from '../types'
import type { ScrapedData } from '@pricenesia/adapters'
import { randomUUID } from 'crypto'

/**
 * Price Refresh Workflow
 * 
 * Durable multi-step workflow that:
 * 1. Fetches product page using browser rendering
 * 2. Extracts price data using platform-specific adapter
 * 3. Validates extracted data (sanity checks)
 * 4. Persists to database
 * 
 * Each step is automatically retried on failure and state is persisted
 * between steps, making the workflow resilient to transient failures.
 */
export class PriceRefreshWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  /**
   * Main workflow execution.
   */
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<WorkflowResult> {
    const { listing_id, platform, url } = event.payload
    
    // Step 1: Fetch product page with browser rendering
    const rendered = await step.do('fetch-page', async () => {
      const result = await renderPageForPlatform(url, this.env, platform)
      return {
        html: result.html,
        finalUrl: result.finalUrl,
        duration: result.duration,
      }
    })
    
    // Step 2: Extract price using platform adapter
    const extracted = await step.do('extract-price', async () => {
      // Use the safe extraction helper that returns a result object
      const result = await runExtractionSafe(platform as Platform, rendered.html)
      
      if (result.success) {
        return { success: true as const, data: result.data }
      } else {
        return {
          success: false as const,
          error: `${result.error._tag}: ${result.error.message}`,
        }
      }
    })
    
    // Handle extraction failure
    if (!extracted.success) {
      return {
        listing_id,
        success: false,
        error: extracted.error,
        completed_at: new Date().toISOString(),
      }
    }
    
    // Step 3: Get previous snapshot for validation context
    const previousSnapshot = await step.do('get-previous', async () => {
      const result = await findLatestPriceForListing(this.env.DB, String(listing_id))
      return result
    })
    
    // Step 4: Validate extracted data
    const validated = await step.do('validate', async () => {
      const context = createValidationContext(
        { platform_id: platform },
        previousSnapshot ? { price: previousSnapshot.price } : null
      )
      
      // Run Effect validation synchronously
      return Effect.runSync(validatePrice(extracted.data, context))
    })
    
    // Step 5: Persist price snapshot
    await step.do('save-snapshot', async () => {
      const data: ScrapedData = {
        ...extracted.data,
        valid: validated.valid,
        flag_reason: validated.reason,
      }
      
      await insertPriceSnapshot(this.env.DB, {
        id: randomUUID(),
        listing_id: String(listing_id),
        price: data.price ?? 0, // Default to 0 if null (will be flagged as invalid)
        original_price: data.original_price ?? undefined,
        stock_status: data.stock_status ?? undefined,
        seller_name: data.seller_name ?? undefined,
      })
      
      // Update listing's last_scraped_at timestamp
      await updateListingScrapedAt(this.env.DB, String(listing_id))
    })
    
    return {
      listing_id,
      success: true,
      data: {
        ...extracted.data,
        valid: validated.valid,
        flag_reason: validated.reason,
      },
      completed_at: new Date().toISOString(),
    }
  }
}

/**
 * Trigger a price refresh workflow for a specific listing.
 * 
 * Note: In Cloudflare Workflows, you trigger by calling workflow.create()
 * with the params as the argument directly (not wrapped in an object).
 */
export async function triggerPriceRefresh(
  workflow: Env['PRICE_REFRESH_WORKFLOW'],
  params: WorkflowParams
): Promise<{ id: string }> {
  // Cloudflare Workflow.create() takes params directly
  const instance = await workflow.create(params as any)
  return { id: instance.id }
}

/**
 * Trigger price refresh for multiple listings.
 */
export async function triggerBatchRefresh(
  workflow: Env['PRICE_REFRESH_WORKFLOW'],
  listings: Array<{ id: number; platform_id: string; raw_url: string }>
): Promise<Array<{ listing_id: number; workflow_id: string }>> {
  const results = await Promise.all(
    listings.map(async (listing) => {
      const params: WorkflowParams = {
        listing_id: listing.id,
        platform: listing.platform_id,
        url: listing.raw_url,
      }
      const instance = await workflow.create(params as any)
      return { listing_id: listing.id, workflow_id: instance.id }
    })
  )
  return results
}