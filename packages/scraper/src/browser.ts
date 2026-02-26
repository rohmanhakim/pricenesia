/**
 * Browser Rendering Module
 *
 * Provides Puppeteer-based page rendering for Cloudflare Workers.
 *
 * Lifecycle contract:
 * - Both functions return a RenderResult with a page object and dispose() method
 * - Caller MUST call dispose() when done to release browser resources
 * - dispose() is async and should be awaited
 * - On internal error, browser is cleaned up automatically before throwing
 */

import puppeteer from '@cloudflare/puppeteer'
import type { Env, RenderOptions, RenderResult } from './types'
import { TOKOPEDIA_PRICE_KEY_PATTERN } from '@pricenesia/shared'

/**
 * Default render options optimized for e-commerce scraping.
 */
const DEFAULT_OPTIONS: Required<Omit<RenderOptions, 'headers'>> & { headers: Record<string, string> } = {
  timeout: 30000,
  // domcontentloaded is intentional — networkidle2 hangs indefinitely on
  // Shopee/Lazada/Tokopedia because they keep firing tracking beacons
  // that prevent the network from ever going idle.
  waitUntil: 'domcontentloaded',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  headers: {},
  viewport: { width: 1920, height: 1080 },
}

/**
 * Platform-specific configurations for user agents and viewports.
 * Shopee and TikTok Shop work better with a mobile UA.
 */
const PLATFORM_CONFIGS: Record<string, Partial<RenderOptions>> = {
  shopee: {
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: { width: 390, height: 844 },
  },
  tiktokshop: {
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: { width: 390, height: 844 },
  },
}

/**
 * DOM selectors used to confirm product page content has loaded.
 * Only for platforms where a stable DOM element exists.
 *
 * Tokopedia and Shopee are intentionally absent — they use JS data layer
 * checks via waitForFunction instead (see waitForPlatformReady).
 *
 * NOTE: Never use hashed class names (e.g. Shopee's .YbrgNj) — they change
 * with every frontend deploy.
 */
const PLATFORM_READY_SELECTORS: Record<string, string> = {
  // tokopedia: omitted — Zeus framework, data is in window.__cache not DOM
  // shopee: omitted — class names are hashed and unstable
  blibli: '[data-testid="product-price"]',
  lazada: '.pdp-price',
  tiktokshop: '[data-e2e="product-price"]',
}

/**
 * Platforms that need a homepage warmup visit before navigating to the
 * product page. Skipping this is the strongest bot signal for Shopee/Lazada.
 */
const WARMUP_URLS: Record<string, string> = {
  shopee: 'https://shopee.co.id',
  lazada: 'https://www.lazada.co.id',
}

type AcquiredBrowser = Awaited<ReturnType<typeof puppeteer.connect>> | Awaited<ReturnType<typeof puppeteer.launch>>

/**
 * Try to connect to an existing idle browser session.
 * Falls back to launching a new one if none are available.
 *
 * Using connect/disconnect instead of launch/close keeps sessions warm
 * in the Cloudflare pool and avoids cold-start bot fingerprinting.
 */
async function acquireBrowser(env: Env): Promise<{ browser: AcquiredBrowser; reused: boolean }> {
  const sessions = await puppeteer.sessions(env.BROWSER as any)

  const availableSessionId = sessions
    .filter(s => !s.connectionId)
    .map(s => s.sessionId)[0]

  if (availableSessionId) {
    try {
      const browser = await puppeteer.connect(env.BROWSER as any, availableSessionId)
      return { browser, reused: true }
    } catch {
      // Another worker claimed it between listing and connecting — fall through
    }
  }

  const browser = await puppeteer.launch(env.BROWSER as any)
  return { browser, reused: false }
}

/**
 * Wait for platform-specific signal that product data is available.
 * Must be called after page.goto() resolves, before extracting HTML.
 *
 * Platforms using JS data layer checks (Tokopedia, Shopee) wait for the
 * specific cache/state key that the adapter will read — so when this
 * resolves, the data is guaranteed present.
 */
async function waitForPlatformReady(page: any, platform: string): Promise<void> {
  const domSelector = PLATFORM_READY_SELECTORS[platform]

  if (domSelector) {
    await page.waitForSelector(domSelector, { timeout: 10000 }).catch(() => null)
    return
  }

  if (platform === 'tokopedia') {
    // Tokopedia runs Zeus framework — product data is in window.__cache
    // (Apollo Client normalised store), not in __NEXT_DATA__ or the DOM.
    // Wait for the price key to appear in the cache before extracting.
    // Pass pattern source as argument since waitForFunction runs in browser context
    // where module imports are not available.
    await page.waitForFunction(
      (patternSource: string) => {
        const pattern = new RegExp(patternSource)
        const cache = (window as any).__cache
        if (!cache) return false
        return Object.keys(cache).some(
          k => k.startsWith('$ROOT_QUERY.pdpMainInfo') && pattern.test(k)
        )
      },
      { timeout: 10000 },
      TOKOPEDIA_PRICE_KEY_PATTERN.source
    ).catch(() => null)
    return
  }

  if (platform === 'shopee') {
    // Shopee's DOM class names are hashed and change with every deploy.
    // Wait for the JS data layer instead.
    await page.waitForFunction(
      () => !!(window as any).__NEXT_DATA__?.props?.pageProps?.initialState?.pdp?.data?.price,
      { timeout: 10000 }
    ).catch(() => null)
    return
  }
}

/**
 * Render a product page with platform-aware configuration.
 *
 * Returns a RenderResult with page access for live extraction.
 * Caller MUST call dispose() when done to return session to pool.
 */
export async function renderPageForPlatform(
  url: string,
  env: Env,
  platform: string,
  options?: RenderOptions
): Promise<RenderResult> {
  const startTime = Date.now()

  const platformConfig = PLATFORM_CONFIGS[platform] ?? {}
  const opts = {
    ...DEFAULT_OPTIONS,
    ...platformConfig,
    ...options,
    headers: { ...DEFAULT_OPTIONS.headers, ...(options?.headers ?? {}) },
  }

  const { browser } = await acquireBrowser(env)

  try {
    const page = await browser.newPage()

    await page.setViewport(opts.viewport)
    await page.setUserAgent(opts.userAgent)
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
      ...opts.headers,
    })

    // Warmup: visit homepage first for platforms with aggressive bot detection
    const warmupUrl = WARMUP_URLS[platform]
    if (warmupUrl) {
      await page.goto(warmupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
        .catch(() => null) // warmup failure is non-fatal
      await sleep(2000 + Math.random() * 1000)
    }

    await page.goto(url, {
      waitUntil: opts.waitUntil as any,
      timeout: opts.timeout,
    })

    const finalUrl = page.url()

    // Wait for product data to be available before extracting HTML
    await waitForPlatformReady(page, platform)

    const html = await page.evaluate(() => document.documentElement.outerHTML)
    const duration = Date.now() - startTime

    return {
      html,
      finalUrl,
      duration,
      page,
      dispose: async () => {
        browser.disconnect()
      },
    }
  } catch (err) {
    // On error, clean up before rethrowing
    browser.disconnect()
    throw err
  }
}

/**
 * Lower-level render for non-platform pages (e.g. health checks, internal tools).
 *
 * Returns a RenderResult with page access for live extraction.
 * Caller MUST call dispose() when done to close the browser.
 */
export async function renderPage(
  url: string,
  env: Env,
  options?: RenderOptions
): Promise<RenderResult> {
  const startTime = Date.now()
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const browser = await puppeteer.launch(env.BROWSER as any)

  try {
    const page = await browser.newPage()

    await page.setViewport(opts.viewport)
    await page.setUserAgent(opts.userAgent)

    if (Object.keys(opts.headers).length > 0) {
      await page.setExtraHTTPHeaders(opts.headers)
    }

    await page.goto(url, {
      waitUntil: opts.waitUntil as any,
      timeout: opts.timeout,
    })

    const finalUrl = page.url()
    const html = await page.evaluate(() => document.documentElement.outerHTML)
    const duration = Date.now() - startTime

    return {
      html,
      finalUrl,
      duration,
      page,
      dispose: async () => {
        await browser.close()
      },
    }
  } catch (err) {
    // On error, clean up before rethrowing
    await browser.close()
    throw err
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}