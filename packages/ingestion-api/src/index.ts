// =============================================================================
// Pricenesia Ingestion API - Main Entry Point
// =============================================================================

import { Hono } from 'hono'
import { EnvBindings, HonoBindings } from './context'
import { authMiddleware } from './middleware/auth'
import { healthRoutes } from './routes/health'
import { productsRoutes } from './routes/products'
import { listingsRoutes } from './routes/listings'

// =============================================================================
// Hono App
// =============================================================================

const app = new Hono<HonoBindings>()

// Auth middleware - applies to all routes
app.use('*', authMiddleware)

// Health check endpoint
app.route('/health', healthRoutes)

// Products API endpoints
app.route('/api/products', productsRoutes)

// Listings API endpoints
app.route('/api/listings', listingsRoutes)

// =============================================================================
// Worker Export
// =============================================================================

export default {
  async fetch(request: Request, env: EnvBindings): Promise<Response> {
    return app.fetch(request, env)
  },
}
