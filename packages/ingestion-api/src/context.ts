// =============================================================================
// Pricenesia Ingestion API - Effect Context & Types
// =============================================================================

import { Context } from 'effect'

// =============================================================================
// Environment Bindings
// =============================================================================

/**
 * Cloudflare Worker environment bindings
 */
export interface EnvBindings {
  ADMIN_API_KEY: string
  DB: D1Database
  ENVIRONMENT: string
  /** Service binding to scraper worker */
  SCRAPER_SERVICE: Fetcher
}

// =============================================================================
// Effect Context
// =============================================================================

/**
 * Effect Context tag for accessing Worker environment bindings
 */
export const WorkerEnv = Context.GenericTag<EnvBindings>('WorkerEnv')

// =============================================================================
// Hono Types
// =============================================================================

/**
 * Hono type bindings for Cloudflare Workers
 */
export type HonoBindings = {
  Bindings: EnvBindings
  Variables: {
    env: EnvBindings
  }
}