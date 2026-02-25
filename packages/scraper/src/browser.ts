/**
 * Browser Rendering Module
 *
 * Provides Puppeteer-based page rendering for Cloudflare Workers.
 */

import puppeteer from '@cloudflare/puppeteer'
import type { PuppeteerPage } from '@pricenesia/adapters'
import type { Env, RenderOptions, RenderResult } from './types'

/**
 * Default render options optimized for e-commerce scraping.
 */
const DEFAULT_OPTIONS: Required<Omit<RenderOptions, 'headers'>> & { headers: Record<string, string> } = {
  timeout: 30000,
  waitUntil: 'networkidle0',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  headers: {},
  viewport: { width: 1920, height: 1080 },
}

/**
 * Launch a browser and create a new page with configured settings.
 */
export async function createBrowserPage(env: Env, options?: RenderOptions): Promise<{
  browser: Awaited<ReturnType<typeof puppeteer.launch>>
  page: PuppeteerPage
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // Launch browser using Cloudflare's Puppeteer binding
  // env.BROWSER is a Fetcher that puppeteer.launch accepts
  const browser = await puppeteer.launch(env.BROWSER as any)
  
  // Create new page
  const page = await browser.newPage()
  
  // Configure page
  await page.setViewport(opts.viewport)
  await page.setUserAgent(opts.userAgent)
  
  if (Object.keys(opts.headers).length > 0) {
    await page.setExtraHTTPHeaders(opts.headers)
  }
  
  return { browser, page: page as unknown as PuppeteerPage }
}

/**
 * Render a product page and return the HTML content.
 * 
 * This function:
 * 1. Launches a browser instance
 * 2. Navigates to the URL
 * 3. Waits for the page to load
 * 4. Returns the HTML content and page object for extraction
 */
export async function renderPage(
  url: string,
  env: Env,
  options?: RenderOptions
): Promise<RenderResult> {
  const startTime = Date.now()
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  const { browser, page } = await createBrowserPage(env, options)
  
  try {
    // Navigate to URL
    await page.goto(url, {
      waitUntil: opts.waitUntil,
      timeout: opts.timeout,
    })
    
    // Get final URL after redirects
    const finalUrl = await page.url()
    
    // Get page content
    const html = await page.evaluate(() => document.documentElement.outerHTML)
    
    const duration = Date.now() - startTime
    
    return {
      html,
      finalUrl,
      duration,
      page,
    }
  } finally {
    // Always close the browser to free resources
    await browser.close()
  }
}

/**
 * Render a page with platform-specific wait conditions.
 * 
 * Some platforms need extra wait time for dynamic content.
 */
export async function renderPageForPlatform(
  url: string,
  env: Env,
  platform: string,
  options?: RenderOptions
): Promise<RenderResult> {
  const result = await renderPage(url, env, options)
  
  // Platform-specific wait conditions
  const waitSelectors: Record<string, string> = {
    tokopedia: '[data-testid="pdp-product-price"]',
    shopee: '.YbrgNj',
    lazada: '.pdp-price',
    blibli: '.product-price',
    tiktokshop: '[data-e2e="product-price"]',
  }
  
  const selector = waitSelectors[platform]
  if (selector && result.page) {
    try {
      await result.page.waitForSelector(selector, { timeout: 5000 })
    } catch {
      // Selector not found, but continue anyway
      // Page might have a different structure or product might be unavailable
    }
  }
  
  // Re-extract HTML after waiting
  const html = await result.page.evaluate(() => document.documentElement.outerHTML)
  
  return { ...result, html }
}