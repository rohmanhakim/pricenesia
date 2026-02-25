/**
 * Tokopedia Adapter Tests
 *
 * Tests extraction from window.__cache (Apollo normalized cache).
 * Uses real HTML snapshot from fixtures/tokopedia-pdp.html
 */

import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { TokopediaApolloCache, TokopediaPriceObject, TokopediaStockObject, TokopediaBasicInfo } from '../types'

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Load the real HTML fixture and extract __cache
 */
function loadCacheFromHTML(): TokopediaApolloCache | null {
  const htmlPath = join(__dirname, 'fixtures', 'tokopedia-pdp.html')
  const html = readFileSync(htmlPath, 'utf-8')

  // Create JSDOM with script execution enabled
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
  })

  // Wait for scripts to execute and extract __cache
  const win = dom.window as unknown as { __cache?: TokopediaApolloCache }

  return win.__cache ?? null
}

// ============================================================================
// Tests
// ============================================================================

describe('Tokopedia Apollo Cache Extraction', () => {
  it('should load __cache from HTML fixture', () => {
    const cache = loadCacheFromHTML()

    expect(cache).not.toBeNull()
    expect(typeof cache).toBe('object')
  })

  it('should match price key with any component index using regex', () => {
    // Test that the regex pattern matches different component indices
    const testKeys = [
      '$ROOT_QUERY.pdpMainInfo({"productKey":"test"}).components.3.data.0.price',
      '$ROOT_QUERY.pdpMainInfo({"productKey":"test"}).components.4.data.0.price',
      '$ROOT_QUERY.pdpMainInfo({"productKey":"test"}).components.0.data.0.price',
      '$ROOT_QUERY.pdpMainInfo({"productKey":"abc123"}).components.15.data.0.price',
    ]

    const regex = /\.components\.\d+\.data\.0\.price$/

    for (const key of testKeys) {
      expect(regex.test(key)).toBe(true)
    }
  })

  it('should not match invalid price keys', () => {
    // Keys that should NOT match the price regex pattern
    const invalidKeys = [
      '$ROOT_QUERY.pdpMainInfo({"productKey":"test"}).components.3.data.0.stock', // stock not price
      '$ROOT_QUERY.pdpMainInfo({"productKey":"test"}).components.3.data.1.price', // data.1 not data.0
      'pdpBasicInfo123', // no components pattern
    ]

    const regex = /\.components\.\d+\.data\.0\.price$/

    for (const key of invalidKeys) {
      expect(regex.test(key)).toBe(false)
    }
  })

  it('should match valid price keys only with correct prefix + regex', () => {
    // Test the full adapter logic: prefix check + regex
    const validKeys = [
      '$ROOT_QUERY.pdpMainInfo({"productKey":"test"}).components.3.data.0.price',
      '$ROOT_QUERY.pdpMainInfo({"productKey":"abc"}).components.5.data.0.price',
    ]

    const invalidKeys = [
      'someOtherKey.components.3.data.0.price', // wrong prefix
      '$ROOT_QUERY.somethingElse.components.3.data.0.price', // wrong prefix
    ]

    for (const key of validKeys) {
      expect(key.startsWith('$ROOT_QUERY.pdpMainInfo') && /\.components\.\d+\.data\.0\.price$/.test(key)).toBe(true)
    }

    for (const key of invalidKeys) {
      expect(key.startsWith('$ROOT_QUERY.pdpMainInfo') && /\.components\.\d+\.data\.0\.price$/.test(key)).toBe(false)
    }
  })

  it('should find price object in cache using regex pattern', () => {
    const cache = loadCacheFromHTML()
    if (!cache) throw new Error('Cache is null')

    // Use regex pattern to match any component index (e.g., .3., .4., etc.)
    const priceKey = Object.keys(cache).find(
      (k) => k.startsWith('$ROOT_QUERY.pdpMainInfo') && /\.components\.\d+\.data\.0\.price$/.test(k)
    )

    expect(priceKey).toBeDefined()

    const priceObj = cache[priceKey!] as TokopediaPriceObject
    expect(priceObj).toBeDefined()
    expect(priceObj.value).toBe(4599000)
    expect(priceObj.priceFmt).toBe('Rp4.599.000')
    expect(priceObj.slashPriceFmt).toBe('Rp4.649.000')
    expect(priceObj.discPercentage).toBe('1%')
  })

  it('should find stock object in cache using regex pattern', () => {
    const cache = loadCacheFromHTML()
    if (!cache) throw new Error('Cache is null')

    // Use regex pattern to match any component index (e.g., .3., .4., etc.)
    const stockKey = Object.keys(cache).find(
      (k) => k.startsWith('$ROOT_QUERY.pdpMainInfo') && /\.components\.\d+\.data\.0\.stock$/.test(k)
    )

    expect(stockKey).toBeDefined()

    const stockObj = cache[stockKey!] as TokopediaStockObject
    expect(stockObj).toBeDefined()
    expect(stockObj.useStock).toBe(false)
    expect(stockObj.value).toBe('7')
  })

  it('should find basic info in cache', () => {
    const cache = loadCacheFromHTML()
    if (!cache) throw new Error('Cache is null')

    const basicKey = Object.keys(cache).find((k) => k.startsWith('pdpBasicInfo'))

    expect(basicKey).toBeDefined()

    const basicInfo = cache[basicKey!] as TokopediaBasicInfo
    expect(basicInfo).toBeDefined()
    expect(basicInfo.productID).toBe('100314316658')
    expect(basicInfo.shopName).toBe('Coocaa Indonesia Official')
    expect(basicInfo.status).toBe('ACTIVE')
  })
})

describe('Price Parsing', () => {
  it('should parse original price from slashPriceFmt', () => {
    const slashPriceFmt = 'Rp4.649.000'

    const cleaned = slashPriceFmt.replace(/Rp\s*/i, '').replace(/\./g, '').replace(/[^\d]/g, '')
    const price = parseInt(cleaned, 10)

    expect(price).toBe(4649000)
  })

  it('should handle various price formats', () => {
    const testCases = [
      { input: 'Rp4.599.000', expected: 4599000 },
      { input: 'Rp 4.599.000', expected: 4599000 },
      { input: 'Rp100.000', expected: 100000 },
      { input: 'Rp1.234.567.890', expected: 1234567890 },
    ]

    for (const { input, expected } of testCases) {
      const cleaned = input.replace(/Rp\s*/i, '').replace(/\./g, '').replace(/[^\d]/g, '')
      const price = parseInt(cleaned, 10)
      expect(price).toBe(expected)
    }
  })
})

describe('Stock Status Logic', () => {
  it('should return available when useStock is false', () => {
    const stockObj: TokopediaStockObject = {
      useStock: false,
      value: '0',
      stockWording: '',
      __typename: 'pdpContentSnapshotStock',
    }

    const status = determineStockStatus(stockObj)
    expect(status).toBe('available')
  })

  it('should return out_of_stock when stock is 0', () => {
    const stockObj: TokopediaStockObject = {
      useStock: true,
      value: '0',
      stockWording: '',
      __typename: 'pdpContentSnapshotStock',
    }

    const status = determineStockStatus(stockObj)
    expect(status).toBe('out_of_stock')
  })

  it('should return limited when stock is low', () => {
    const stockObj: TokopediaStockObject = {
      useStock: true,
      value: '5',
      stockWording: '',
      __typename: 'pdpContentSnapshotStock',
    }

    const status = determineStockStatus(stockObj)
    expect(status).toBe('limited')
  })

  it('should return available when stock is high', () => {
    const stockObj: TokopediaStockObject = {
      useStock: true,
      value: '100',
      stockWording: '',
      __typename: 'pdpContentSnapshotStock',
    }

    const status = determineStockStatus(stockObj)
    expect(status).toBe('available')
  })

  it('should return null when stockObj is null', () => {
    const status = determineStockStatus(null)
    expect(status).toBeNull()
  })
})

// ============================================================================
// Helper Functions (duplicated for testing since they're not exported)
// ============================================================================

type StockStatus = 'available' | 'limited' | 'out_of_stock'

function determineStockStatus(stockObj: TokopediaStockObject | null): StockStatus | null {
  if (!stockObj) return null

  if (stockObj.useStock === false) {
    return 'available'
  }

  const stockValue = parseInt(stockObj.value ?? '0', 10)

  if (stockValue <= 0) {
    return 'out_of_stock'
  } else if (stockValue <= 10) {
    return 'limited'
  } else {
    return 'available'
  }
}