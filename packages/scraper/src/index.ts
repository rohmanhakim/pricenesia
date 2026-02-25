/**
 * Pricenesia Scraper Package
 *
 * Cloudflare Workflows-based price scraper with browser rendering.
 */

// Export workflow
export { PriceRefreshWorkflow } from './workflows/price-refresh'

// Export browser utilities
export { 
  renderPage, 
  renderPageForPlatform, 
  createBrowserPage 
} from './browser'

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