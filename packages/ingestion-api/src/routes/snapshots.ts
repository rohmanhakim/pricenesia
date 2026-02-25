// =============================================================================
// Pricenesia Ingestion API - Snapshots Routes
// =============================================================================

import { Effect, Layer, Schema } from 'effect'
import { Hono } from 'hono'
import { WorkerEnv, HonoBindings } from '../context'
import { NotFoundError, ValidationError } from '../errors'
import {
  findAllPriceSnapshots,
  countAllPriceSnapshots,
  findLatestPriceForListing,
  findPriceHistoryForListingPaginated,
  countPriceHistoryForListing,
  findFlaggedSnapshotsWithDetails,
  countFlaggedSnapshots,
  findFlaggedSnapshotById,
  markFlaggedSnapshotReviewed,
  listingExists,
} from '@pricenesia/shared/db'
import type { Platform } from '@pricenesia/shared/types'

// =============================================================================
// Validation Schemas
// =============================================================================

const PlatformSchema = Schema.Literal(
  'tokopedia',
  'shopee',
  'blibli',
  'lazada',
  'tiktokshop'
)

const DateStringSchema = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/)
)

const AllSnapshotsQuerySchema = Schema.Struct({
  platform: Schema.optional(PlatformSchema),
  from: Schema.optional(DateStringSchema),
  to: Schema.optional(DateStringSchema),
  limit: Schema.optional(Schema.Number.pipe(Schema.between(1, 100))),
  offset: Schema.optional(Schema.Number.pipe(Schema.between(0, 10000))),
})

const HistoryQuerySchema = Schema.Struct({
  from: Schema.optional(DateStringSchema),
  to: Schema.optional(DateStringSchema),
  limit: Schema.optional(Schema.Number.pipe(Schema.between(1, 100))),
  offset: Schema.optional(Schema.Number.pipe(Schema.between(0, 10000))),
})

const FlaggedQuerySchema = Schema.Struct({
  platform: Schema.optional(PlatformSchema),
  limit: Schema.optional(Schema.Number.pipe(Schema.between(1, 100))),
  offset: Schema.optional(Schema.Number.pipe(Schema.between(0, 10000))),
})

// =============================================================================
// Handlers
// =============================================================================

/**
 * Handler for GET /api/snapshots
 * Lists all price snapshots across all listings with filtering
 */
const listAllSnapshotsHandler = (queryParams: Record<string, string | undefined>) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // Parse and validate query parameters
    const validated = yield* _(
      Schema.decodeUnknown(AllSnapshotsQuerySchema)({
        platform: queryParams.platform,
        from: queryParams.from,
        to: queryParams.to,
        limit: queryParams.limit ? parseInt(queryParams.limit, 10) : undefined,
        offset: queryParams.offset ? parseInt(queryParams.offset, 10) : undefined,
      }).pipe(
        Effect.mapError(
          (e) =>
            new ValidationError({
              message: 'Invalid query parameters',
              fields: Object.keys(e.issue),
            })
        )
      )
    )

    const options = {
      platform: validated.platform,
      from: validated.from,
      to: validated.to,
      limit: validated.limit ?? 30,
      offset: validated.offset ?? 0,
    }

    const [snapshots, total] = yield* _(
      Effect.all([
        Effect.tryPromise(() => findAllPriceSnapshots(env.DB, options)),
        Effect.tryPromise(() => countAllPriceSnapshots(env.DB, options)),
      ])
    )

    return {
      snapshots,
      total,
      limit: options.limit,
      offset: options.offset,
    }
  })

/**
 * Handler for GET /api/snapshots/listings/:listingId/latest
 * Gets the latest price snapshot for a listing
 */
const getLatestSnapshotHandler = (listingId: string) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // Check if listing exists
    const exists = yield* _(
      Effect.tryPromise(() => listingExists(env.DB, listingId))
    )

    if (!exists) {
      yield* _(
        Effect.fail(
          new NotFoundError({
            message: `Listing with id '${listingId}' not found`,
            resource: 'platform_listing',
          })
        )
      )
    }

    const snapshot = yield* _(
      Effect.tryPromise(() => findLatestPriceForListing(env.DB, listingId)).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: `No price snapshot found for listing '${listingId}'`,
                  resource: 'price_snapshot',
                })
              )
            : Effect.succeed(result)
        )
      )
    )

    return snapshot
  })

/**
 * Handler for GET /api/snapshots/listings/:listingId/history
 * Gets price history for a listing with pagination and date filtering
 */
const getHistoryHandler = (listingId: string, queryParams: Record<string, string | undefined>) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // Check if listing exists
    const exists = yield* _(
      Effect.tryPromise(() => listingExists(env.DB, listingId))
    )

    if (!exists) {
      yield* _(
        Effect.fail(
          new NotFoundError({
            message: `Listing with id '${listingId}' not found`,
            resource: 'platform_listing',
          })
        )
      )
    }

    // Parse and validate query parameters
    const validated = yield* _(
      Schema.decodeUnknown(HistoryQuerySchema)({
        from: queryParams.from,
        to: queryParams.to,
        limit: queryParams.limit ? parseInt(queryParams.limit, 10) : undefined,
        offset: queryParams.offset ? parseInt(queryParams.offset, 10) : undefined,
      }).pipe(
        Effect.mapError(
          (e) =>
            new ValidationError({
              message: 'Invalid query parameters',
              fields: Object.keys(e.issue),
            })
        )
      )
    )

    const options = {
      from: validated.from,
      to: validated.to,
      limit: validated.limit ?? 30,
      offset: validated.offset ?? 0,
    }

    const [snapshots, total] = yield* _(
      Effect.all([
        Effect.tryPromise(() => findPriceHistoryForListingPaginated(env.DB, listingId, options)),
        Effect.tryPromise(() => countPriceHistoryForListing(env.DB, listingId, options)),
      ])
    )

    return {
      snapshots,
      total,
      listing_id: listingId,
      limit: options.limit,
      offset: options.offset,
    }
  })

/**
 * Handler for GET /api/snapshots/flagged
 * Lists unreviewed flagged snapshots with listing details
 */
const listFlaggedHandler = (queryParams: Record<string, string | undefined>) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // Parse and validate query parameters
    const validated = yield* _(
      Schema.decodeUnknown(FlaggedQuerySchema)({
        platform: queryParams.platform,
        limit: queryParams.limit ? parseInt(queryParams.limit, 10) : undefined,
        offset: queryParams.offset ? parseInt(queryParams.offset, 10) : undefined,
      }).pipe(
        Effect.mapError(
          (e) =>
            new ValidationError({
              message: 'Invalid query parameters',
              fields: Object.keys(e.issue),
            })
        )
      )
    )

    const options = {
      platform: validated.platform,
      limit: validated.limit ?? 50,
      offset: validated.offset ?? 0,
    }

    const [flaggedSnapshots, total] = yield* _(
      Effect.all([
        Effect.tryPromise(() => findFlaggedSnapshotsWithDetails(env.DB, options)),
        Effect.tryPromise(() => countFlaggedSnapshots(env.DB, options)),
      ])
    )

    return {
      flagged_snapshots: flaggedSnapshots,
      total,
      limit: options.limit,
      offset: options.offset,
    }
  })

/**
 * Handler for POST /api/snapshots/flagged/:id/review
 * Marks a flagged snapshot as reviewed
 */
const reviewFlaggedHandler = (id: string) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // Check if flagged snapshot exists
    const existing = yield* _(
      Effect.tryPromise(() => findFlaggedSnapshotById(env.DB, id)).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: `Flagged snapshot with id '${id}' not found`,
                  resource: 'flagged_snapshot',
                })
              )
            : Effect.succeed(result)
        )
      )
    )

    // Mark as reviewed
    const updated = yield* _(
      Effect.tryPromise(() => markFlaggedSnapshotReviewed(env.DB, id))
    )

    return {
      success: true,
      id,
      reviewed: true,
    }
  })

// =============================================================================
// Routes
// =============================================================================

const snapshotsRoutes = new Hono<HonoBindings>()

// GET /api/snapshots - List all snapshots across all listings
snapshotsRoutes.get('/', async (c) => {
  const env = c.get('env')
  const queryParams = {
    platform: c.req.query('platform'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  }

  const result = await Effect.runPromise(
    listAllSnapshotsHandler(queryParams).pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: (data) => ({ success: true, data } as const),
        onFailure: (error) => ({ success: false, error } as const),
      })
    )
  )

  if (!result.success) {
    const { error } = result
    switch (error._tag) {
      case 'ValidationError':
        return c.json(
          { error: 'Validation Error', message: error.message, fields: error.fields },
          400
        )
      default:
        return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500)
    }
  }

  return c.json(result.data)
})

// GET /api/snapshots/flagged - List flagged snapshots (must come before /listings/:id)
snapshotsRoutes.get('/flagged', async (c) => {
  const env = c.get('env')
  const queryParams = {
    platform: c.req.query('platform'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  }

  const result = await Effect.runPromise(
    listFlaggedHandler(queryParams).pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: (data) => ({ success: true, data } as const),
        onFailure: (error) => ({ success: false, error } as const),
      })
    )
  )

  if (!result.success) {
    const { error } = result
    switch (error._tag) {
      case 'ValidationError':
        return c.json(
          { error: 'Validation Error', message: error.message, fields: error.fields },
          400
        )
      default:
        return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500)
    }
  }

  return c.json(result.data)
})

// POST /api/snapshots/flagged/:id/review - Mark flagged snapshot as reviewed
snapshotsRoutes.post('/flagged/:id/review', async (c) => {
  const env = c.get('env')
  const id = c.req.param('id')

  const result = await Effect.runPromise(
    reviewFlaggedHandler(id).pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: (data) => ({ success: true, data } as const),
        onFailure: (error) => ({ success: false, error } as const),
      })
    )
  )

  if (!result.success) {
    const { error } = result
    switch (error._tag) {
      case 'NotFoundError':
        return c.json({ error: 'Not Found', message: error.message }, 404)
      default:
        return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500)
    }
  }

  return c.json(result.data)
})

// GET /api/snapshots/listings/:listingId/latest - Get latest snapshot for listing
snapshotsRoutes.get('/listings/:listingId/latest', async (c) => {
  const env = c.get('env')
  const listingId = c.req.param('listingId')

  const result = await Effect.runPromise(
    getLatestSnapshotHandler(listingId).pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: (data) => ({ success: true, data } as const),
        onFailure: (error) => ({ success: false, error } as const),
      })
    )
  )

  if (!result.success) {
    const { error } = result
    switch (error._tag) {
      case 'NotFoundError':
        return c.json({ error: 'Not Found', message: error.message }, 404)
      default:
        return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500)
    }
  }

  return c.json(result.data)
})

// GET /api/snapshots/listings/:listingId/history - Get price history for listing
snapshotsRoutes.get('/listings/:listingId/history', async (c) => {
  const env = c.get('env')
  const listingId = c.req.param('listingId')
  const queryParams = {
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  }

  const result = await Effect.runPromise(
    getHistoryHandler(listingId, queryParams).pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: (data) => ({ success: true, data } as const),
        onFailure: (error) => ({ success: false, error } as const),
      })
    )
  )

  if (!result.success) {
    const { error } = result
    switch (error._tag) {
      case 'ValidationError':
        return c.json(
          { error: 'Validation Error', message: error.message, fields: error.fields },
          400
        )
      case 'NotFoundError':
        return c.json({ error: 'Not Found', message: error.message }, 404)
      default:
        return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500)
    }
  }

  return c.json(result.data)
})

export { snapshotsRoutes }