// =============================================================================
// Pricenesia Ingestion API - Health Check Route
// =============================================================================

import { Effect, Layer } from 'effect'
import { Hono } from 'hono'
import { EnvBindings, WorkerEnv, HonoBindings } from '../context'
import { getTimestamp } from '@pricenesia/shared/utils'

// =============================================================================
// Health Handler
// =============================================================================

/**
 * Health check handler using Effect
 */
const healthHandler = Effect.gen(function* (_) {
  const env = yield* _(WorkerEnv)

  return {
    status: 'ok' as const,
    timestamp: getTimestamp(),
    environment: env.ENVIRONMENT,
  }
})

// =============================================================================
// Route
// =============================================================================

const healthRoutes = new Hono<HonoBindings>()

healthRoutes.get('/', async (c) => {
  const env = c.get('env')

  const result = await Effect.runPromise(
    healthHandler.pipe(Effect.provide(Layer.succeed(WorkerEnv, env)))
  )

  return c.json(result)
})

export { healthRoutes }