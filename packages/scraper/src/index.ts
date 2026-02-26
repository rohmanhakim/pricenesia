/**
 * Pricenesia Scraper Package
 *
 * Cloudflare Workflows-based price scraper with browser rendering.
 */

import { PriceRefreshWorkflow } from './workflows/price-refresh'
import { BatchPriceRefreshWorkflow } from './workflows/batch-price-refresh'
import { renderPage, renderPageForPlatform } from './browser'
import type { Env } from './types'

// Re-export for external use
export { PriceRefreshWorkflow, BatchPriceRefreshWorkflow }

// Export browser utilities
export { 
  renderPage, 
  renderPageForPlatform 
}

// Export validation utilities
export { 
  validatePrice, 
  validateBatch, 
  runValidation, 
  createValidationContext,
  ZeroPriceError,
  PriceBelowFloorError,
  PriceChangeTooLargeError,
} from './validation'

// Export types
export type {
  WorkflowParams,
  WorkflowResult,
  BatchWorkflowParams,
  BatchWorkflowResult,
  RenderOptions,
  RenderResult,
  ValidationContext,
  ValidationResult,
  Env,
} from './types'

// Re-export adapter types for convenience
export type { 
  ScrapedData, 
  StockStatus, 
  PuppeteerPage,
  PlatformAdapter,
} from '@pricenesia/adapters'

// =============================================================================
// API Handlers for Service Binding
// =============================================================================

interface ScrapeStartResponse {
  success: boolean
  instance_id: string
  message: string
}

interface ScrapeStatusResponse {
  instance_id: string | null
  status: string
  started_at?: string
  completed_at?: string
}

interface ScrapeStopResponse {
  success: boolean
  instance_id: string
  message: string
}

/**
 * Handle scrape/start request - starts a new batch workflow
 */
async function handleScrapeStart(request: Request, env: Env): Promise<Response> {
  try {
    // Create a new workflow instance
    const instance = await env.BATCH_PRICE_REFRESH_WORKFLOW.create({})
    
    const response: ScrapeStartResponse = {
      success: true,
      instance_id: instance.id,
      message: 'Batch scrape workflow started successfully',
    }
    
    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to start workflow',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Handle scrape/stop request - pauses a workflow
 */
async function handleScrapeStop(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { instance_id?: string }
    const instanceId = body.instance_id

    if (!instanceId) {
      return new Response(JSON.stringify({
        error: 'Validation Error',
        message: 'instance_id is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const instance = await env.BATCH_PRICE_REFRESH_WORKFLOW.get(instanceId)
    await instance.pause()

    const response: ScrapeStopResponse = {
      success: true,
      instance_id: instanceId,
      message: 'Workflow paused successfully',
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to stop workflow',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Handle scrape/status request - get workflow status
 */
async function handleScrapeStatus(instanceId: string, env: Env): Promise<Response> {
  try {
    const instance = await env.BATCH_PRICE_REFRESH_WORKFLOW.get(instanceId)
    const status = await instance.status()

    const response: ScrapeStatusResponse = {
      instance_id: instanceId,
      status: status.status,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const response: ScrapeStatusResponse = {
      instance_id: instanceId,
      status: 'unknown',
    }
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // API routes for service binding calls
    if (path === '/scrape/start' && request.method === 'POST') {
      return handleScrapeStart(request, env)
    }

    if (path === '/scrape/stop' && request.method === 'POST') {
      return handleScrapeStop(request, env)
    }

    if (path.startsWith('/scrape/status/') && request.method === 'GET') {
      const instanceId = path.replace('/scrape/status/', '')
      return handleScrapeStatus(instanceId, env)
    }

    // Test browser rendering directly
    if (path === '/test-browser' && request.method === 'GET') {
      const testUrl = url.searchParams.get('url')
      
      if (!testUrl) {
        return new Response(JSON.stringify({
          error: 'Missing URL parameter',
          usage: 'GET /test-browser?url=https://example.com'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      let result
      try {
        const startTime = Date.now()
        result = await renderPage(testUrl, env, { timeout: 15000 })
        const duration = Date.now() - startTime

        return new Response(JSON.stringify({
          success: true,
          url: testUrl,
          finalUrl: result.finalUrl,
          duration_ms: duration,
          html_length: result.html.length,
          html_preview: result.html.substring(0, 500) + '...',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          url: testUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      } finally {
        // Always release browser resources
        if (result) {
          await result.dispose()
        }
      }
    }

    // Default response
    return new Response('Pricenesia Scraper API\n\nEndpoints:\n  POST /scrape/start - Start batch scrape\n  POST /scrape/stop - Pause workflow\n  GET /scrape/status/:id - Get status\n  GET /test-browser?url=<url> - Test browser rendering', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  },
}