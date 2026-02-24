// =============================================================================
// Pricenesia Ingestion API - Main Entry Point
// =============================================================================

import { Hono } from 'hono'
import { EnvBindings, HonoBindings } from './context'
import { authMiddleware } from './middleware/auth'
import { healthRoutes } from './routes/health'

// =============================================================================
// Hono App
// =============================================================================

const app = new Hono<HonoBindings>()

// Auth middleware - applies to all routes
app.use('*', authMiddleware)

// Health check endpoint
app.route('/health', healthRoutes)

// =============================================================================
// Worker Export
// =============================================================================

export default {
  async fetch(request: Request, env: EnvBindings): Promise<Response> {
    return app.fetch(request, env)
  },
}