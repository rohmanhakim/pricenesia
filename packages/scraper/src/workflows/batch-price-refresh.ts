/**
 * Batch Price Refresh Workflow
 *
 * Durable workflow that processes ALL active listings sequentially.
 * This is the main workflow triggered by:
 * 1. Cron job (daily at 2 AM WIB)
 * 2. Manual trigger via ingestion-api /api/scrape/start
 * 
 * Can be paused/resumed via the workflow instance.
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import { Effect } from 'effect'
import { randomUUID } from 'crypto'
import { runExtractionSafe } from '@pricenesia/adapters'
import type { Platform } from '@pricenesia/shared/types'
import { renderPageForPlatform } from '../browser'
import { validatePrice, createValidationContext } from '../validation'
import { 
  insertPriceSnapshot, 
  findLatestPriceForListing,
  updateListingScrapedAt,
  findListingsForScrape,
  insertFlaggedSnapshot,
} from '@pricenesia/shared/db'
import type { Env, BatchWorkflowParams, BatchWorkflowResult, WorkflowResult } from '../types'
import type { ScrapedData } from '@pricenesia/adapters'

/**
 * Sleep utility for jitter delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate random jitter delay (4-8 seconds)
 */
function jitterDelay(): number {
  return 4000 + Math.random() * 4000
}

/**
 * Batch Price Refresh Workflow
 * 
 * Fetches all active listings from D1 and processes them sequentially
 * with jitter delays between requests. Each listing is processed as a
 * separate step for durability and retry capability.
 */
export class BatchPriceRefreshWorkflow extends WorkflowEntrypoint<Env, BatchWorkflowParams> {
  /**
   * Main workflow execution.
   */
  async run(event: WorkflowEvent<BatchWorkflowParams>, step: WorkflowStep): Promise<BatchWorkflowResult> {
    const startTime = new Date().toISOString()
    const results: WorkflowResult[] = []
    let successCount = 0
    let failureCount = 0
    
    // Step 1: Fetch all active listings
    const listings = await step.do('fetch-listings', async () => {
      const result = await findListingsForScrape(this.env.DB)
      return result.map(l => ({
        id: l.id,
        platform: l.platform,
        raw_url: l.raw_url,
        product_name: l.product_name,
        model_number: l.model_number,
      }))
    })
    
    // If no listings, return early
    if (listings.length === 0) {
      return {
        success: true,
        total_listings: 0,
        success_count: 0,
        failure_count: 0,
        results: [],
        started_at: startTime,
        completed_at: new Date().toISOString(),
      }
    }
    
    // Step 2..N: Process each listing sequentially
    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i]
      const stepName = `scrape-${i}-${listing.id.substring(0, 8)}`
      
      try {
        const result = await step.do(stepName, async () => {
          // Jitter delay between requests (not before first request)
          if (i > 0) {
            await sleep(jitterDelay())
          }
          
          // Fetch page with browser
          const rendered = await renderPageForPlatform(
            listing.raw_url,
            this.env,
            listing.platform as Platform
          )
          
          try {
            // Extract price using the live page object (not HTML string)
            // The adapter needs page.evaluate() to access window.__cache
            const extracted = await runExtractionSafe(
              listing.platform as Platform,
              rendered.page
            )
            
            if (!extracted.success) {
              return {
                listing_id: listing.id,
                success: false,
                error: `${extracted.error._tag}: ${extracted.error.message}`,
              }
            }
            
            // Get previous snapshot for validation
            const previousSnapshot = await findLatestPriceForListing(
              this.env.DB,
              listing.id
            )
            
            // Validate
            const context = createValidationContext(
              { platform_id: listing.platform },
              previousSnapshot ? { price: previousSnapshot.price } : null
            )
            
            const validated = Effect.runSync(validatePrice(extracted.data, context))
            
            // Persist snapshot
            if (validated.valid) {
              await insertPriceSnapshot(this.env.DB, {
                id: randomUUID(),
                listing_id: listing.id,
                price: extracted.data.price ?? 0,
                original_price: extracted.data.original_price ?? undefined,
                stock_status: extracted.data.stock_status ?? undefined,
                seller_name: extracted.data.seller_name ?? undefined,
              })
            } else {
              // Insert to flagged snapshots
              await insertFlaggedSnapshot(this.env.DB, {
                id: randomUUID(),
                listing_id: listing.id,
                scraped_price: extracted.data.price,
                last_known_price: previousSnapshot?.price ?? null,
                change_ratio: previousSnapshot && extracted.data.price
                  ? Math.abs(extracted.data.price - previousSnapshot.price) / previousSnapshot.price
                  : null,
                flag_reason: validated.reason ?? 'unknown',
              })
            }
            
            // Update last_scraped_at
            await updateListingScrapedAt(this.env.DB, listing.id)
            
            return {
              listing_id: listing.id,
              success: true,
              data: {
                ...extracted.data,
                valid: validated.valid,
                flag_reason: validated.reason,
              },
            }
          } finally {
            // Always close the browser to free resources
            await rendered.browser.close()
          }
        })
        
        results.push(result as WorkflowResult)
        if (result.success) {
          successCount++
        } else {
          failureCount++
        }
      } catch (error) {
        // Handle step failure (workflow may retry)
        results.push({
          listing_id: listing.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        failureCount++
      }
    }
    
    return {
      success: failureCount === 0,
      total_listings: listings.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
      started_at: startTime,
      completed_at: new Date().toISOString(),
    }
  }
}

/**
 * Trigger a batch price refresh workflow.
 */
export async function triggerBatchRefresh(
  workflow: Env['BATCH_PRICE_REFRESH_WORKFLOW'],
  params: BatchWorkflowParams = {}
): Promise<{ id: string }> {
  const instance = await workflow.create(params as any)
  return { id: instance.id }
}