// =============================================================================
// Pricenesia Ingestion API - Auth Middleware
// =============================================================================

import { Effect, Layer } from 'effect'
import { createMiddleware } from 'hono/factory'
import { EnvBindings, WorkerEnv, HonoBindings } from '../context'
import { UnauthorizedError, ForbiddenError } from '../errors'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

/**
 * Validate auth token against ADMIN_API_KEY
 */
function validateAuth(
  authHeader: string | undefined
): Effect.Effect<void, UnauthorizedError | ForbiddenError, EnvBindings> {
  return Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)
    const token = extractBearerToken(authHeader)

    if (!token) {
      yield* _(
        Effect.fail(
          new UnauthorizedError({ message: 'Missing or invalid Authorization header' })
        )
      )
      return
    }

    if (token !== env.ADMIN_API_KEY) {
      yield* _(Effect.fail(new ForbiddenError({ message: 'Invalid API key' })))
      return
    }
  })
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Auth middleware - validates Bearer token against ADMIN_API_KEY
 * Applies to all routes
 */
export const authMiddleware = createMiddleware<HonoBindings>(async (c, next) => {
  const env: EnvBindings = {
    ADMIN_API_KEY: c.env.ADMIN_API_KEY,
    DB: c.env.DB,
    ENVIRONMENT: c.env.ENVIRONMENT,
    SCRAPER_SERVICE: c.env.SCRAPER_SERVICE,
  }

  const authHeader = c.req.header('Authorization')

  const result = await Effect.runPromise(
    validateAuth(authHeader).pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: () => ({ success: true } as const),
        onFailure: (error) => ({ success: false, error } as const),
      })
    )
  )

  if (!result.success) {
    if (result.error._tag === 'UnauthorizedError') {
      return c.json({ error: 'Unauthorized', message: result.error.message }, 401)
    }
    if (result.error._tag === 'ForbiddenError') {
      return c.json({ error: 'Forbidden', message: result.error.message }, 403)
    }
    return c.json({ error: 'Internal Server Error' }, 500)
  }

  c.set('env', env)
  await next()
})