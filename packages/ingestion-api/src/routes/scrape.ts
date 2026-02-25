// =============================================================================
// Pricenesia Ingestion API - Scrape Routes
// =============================================================================

import { Hono } from 'hono'
import { HonoBindings, type EnvBindings } from '../context'

// =============================================================================
// Types
// =============================================================================

interface ScrapeStartResponse {
  success: boolean
  instance_id: string
  message: string
}

interface ScrapeStatusResponse {
  instance_id: string | null
  status: 'running' | 'paused' | 'errored' | 'terminated' | 'complete' | 'queued' | 'waiting' | 'waitingForPause' | 'unknown' | 'idle'
  started_at?: string
  completed_at?: string
}

interface ScrapeStopResponse {
  success: boolean
  instance_id: string
  message: string
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Start a new batch scrape workflow by calling the scraper service
 */
async function startScrape(env: EnvBindings): Promise<ScrapeStartResponse> {
  // Call the scraper service to start the workflow
  const response = await env.SCRAPER_SERVICE.fetch(
    new Request('http://internal/scrape/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to start scrape: ${response.status} ${errorText}`)
  }

  const result = await response.json() as ScrapeStartResponse
  return result
}

/**
 * Stop/pause a running workflow instance via scraper service
 */
async function stopScrape(env: EnvBindings, instanceId: string): Promise<ScrapeStopResponse> {
  const response = await env.SCRAPER_SERVICE.fetch(
    new Request('http://internal/scrape/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instance_id: instanceId }),
    })
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to stop scrape: ${response.status} ${errorText}`)
  }

  const result = await response.json() as ScrapeStopResponse
  return result
}

/**
 * Get workflow status via scraper service
 */
async function getScrapeStatus(env: EnvBindings, instanceId: string | undefined): Promise<ScrapeStatusResponse> {
  // If no instance ID, return idle status
  if (!instanceId) {
    return {
      instance_id: null,
      status: 'idle',
    }
  }

  const response = await env.SCRAPER_SERVICE.fetch(
    new Request(`http://internal/scrape/status/${instanceId}`, {
      method: 'GET',
    })
  )

  if (!response.ok) {
    return {
      instance_id: instanceId,
      status: 'unknown',
    }
  }

  const result = await response.json() as ScrapeStatusResponse
  return result
}

// =============================================================================
// Routes
// =============================================================================

const scrapeRoutes = new Hono<HonoBindings>()

// POST /api/scrape/start - Start a new batch scrape
scrapeRoutes.post('/start', async (c) => {
  const env = c.get('env')

  try {
    const result = await startScrape(env)
    return c.json(result, 201)
  } catch (error) {
    return c.json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to start scrape workflow',
    }, 500)
  }
})

// POST /api/scrape/stop - Stop/pause a running workflow
scrapeRoutes.post('/stop', async (c) => {
  const env = c.get('env')
  let body: { instance_id?: string }

  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  const instanceId = body.instance_id

  if (!instanceId) {
    return c.json(
      { error: 'Validation Error', message: 'instance_id is required' },
      400
    )
  }

  try {
    const result = await stopScrape(env, instanceId)
    return c.json(result)
  } catch (error) {
    return c.json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to stop workflow',
    }, 500)
  }
})

// GET /api/scrape/status - Get workflow status
scrapeRoutes.get('/status', async (c) => {
  const env = c.get('env')
  const instanceId = c.req.query('instance_id')

  try {
    const result = await getScrapeStatus(env, instanceId)
    return c.json(result)
  } catch (error) {
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to get workflow status',
    }, 500)
  }
})

// GET /api/scrape/status/:instanceId - Get specific workflow status
scrapeRoutes.get('/status/:instanceId', async (c) => {
  const env = c.get('env')
  const instanceId = c.req.param('instanceId')

  try {
    const result = await getScrapeStatus(env, instanceId)
    return c.json(result)
  } catch (error) {
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to get workflow status',
    }, 500)
  }
})

export { scrapeRoutes }