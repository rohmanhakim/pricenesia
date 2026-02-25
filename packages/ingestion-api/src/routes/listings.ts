// =============================================================================
// Pricenesia Ingestion API - Listings Routes
// =============================================================================

import { Effect, Layer, Schema } from 'effect'
import { Hono } from 'hono'
import { WorkerEnv, HonoBindings } from '../context'
import { NotFoundError, ValidationError } from '../errors'
import {
  insertListing,
  findListingById,
  findAllListings,
  canonicalProductExists,
  updateListing,
  deleteListing,
} from '@pricenesia/shared/db'
import type {
  AddListingRequest,
  AddListingResponse,
  ListingListResponse,
  ListingListFilters,
  UpdateListingRequest,
  Platform,
  SellerTier,
  ListingCondition,
} from '@pricenesia/shared/types'

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

const SellerTierSchema = Schema.Literal(
  'official_store',
  'mall',
  'verified',
  'regular'
)

const ConditionSchema = Schema.Literal('new', 'used')

const AddListingSchema = Schema.Struct({
  canonical_product_id: Schema.String.pipe(
    Schema.minLength(3),
    Schema.maxLength(100)
  ),
  platform: PlatformSchema,
  platform_product_id: Schema.optional(Schema.String.pipe(Schema.maxLength(100))),
  seller_id: Schema.optional(Schema.String.pipe(Schema.maxLength(100))),
  seller_name: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.minLength(1),
    Schema.maxLength(255)
  ),
  seller_tier: Schema.optional(SellerTierSchema),
  raw_url: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.maxLength(2000)
  ),
  condition: Schema.optional(ConditionSchema),
  is_pinned_seller: Schema.optional(Schema.Boolean),
})

const ListListingsQuerySchema = Schema.Struct({
  canonical_product_id: Schema.optional(Schema.String),
  platform: Schema.optional(PlatformSchema),
  is_active: Schema.optional(Schema.Boolean),
  condition: Schema.optional(ConditionSchema),
})

const UpdateListingSchema = Schema.Struct({
  seller_name: Schema.optional(
    Schema.String.pipe(Schema.nonEmptyString(), Schema.minLength(1), Schema.maxLength(255))
  ),
  seller_tier: Schema.optional(SellerTierSchema),
  raw_url: Schema.optional(Schema.String.pipe(Schema.maxLength(2000))),
  referral_url: Schema.optional(Schema.String.pipe(Schema.maxLength(2000))),
  is_active: Schema.optional(Schema.Boolean),
  is_pinned_seller: Schema.optional(Schema.Boolean),
  condition: Schema.optional(ConditionSchema),
})

// =============================================================================
// Platform Abbreviation Map
// =============================================================================

const PLATFORM_ABBR: Record<Platform, string> = {
  tokopedia: 'tk',
  shopee: 'sp',
  blibli: 'bl',
  lazada: 'lz',
  tiktokshop: 'tt',
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Generate a redirect code for the listing
 * Pattern: {platform_abbr}-{product_slug}-{seller_abbr}
 */
function generateRedirectCode(
  platform: Platform,
  productId: string,
  sellerName: string
): string {
  const platformAbbr = PLATFORM_ABBR[platform]
  const sellerAbbr = sellerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 20)

  return `${platformAbbr}-${productId}-${sellerAbbr}`
}

/**
 * Handler for POST /api/listings
 * Creates a new platform listing
 */
const addListingHandler = (body: unknown) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // 1. Validate request body
    const validated = yield* _(
      Schema.decodeUnknown(AddListingSchema)(body).pipe(
        Effect.mapError(
          (e) =>
            new ValidationError({
              message: 'Invalid request body',
              fields: Object.keys(e.issue),
            })
        )
      )
    )

    const {
      canonical_product_id,
      platform,
      platform_product_id,
      seller_id,
      seller_name,
      seller_tier,
      raw_url,
      condition,
      is_pinned_seller,
    } = validated as AddListingRequest

    // 2. Validate canonical product exists
    const productExists = yield* _(
      Effect.tryPromise(() => canonicalProductExists(env.DB, canonical_product_id))
    )

    if (!productExists) {
      yield* _(
        Effect.fail(
          new NotFoundError({
            message: `Canonical product with id '${canonical_product_id}' not found`,
            resource: 'canonical_product',
          })
        )
      )
    }

    // 3. Generate listing ID and redirect code
    const listingId = crypto.randomUUID()

    // 4. Insert listing
    yield* _(
      Effect.tryPromise(() =>
        insertListing(env.DB, {
          id: listingId,
          canonical_product_id,
          platform,
          platform_product_id,
          seller_id,
          seller_name,
          seller_tier,
          raw_url,
          condition: condition ?? 'new',
          is_pinned_seller,
        })
      )
    )

    // 5. Fetch and return created listing
    const listing = yield* _(
      Effect.tryPromise(() => findListingById(env.DB, listingId)).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: 'Failed to retrieve created listing',
                  resource: 'platform_listing',
                })
              )
            : Effect.succeed(result)
        )
      )
    )

    const response: AddListingResponse = {
      id: listing.id,
      canonical_product_id: listing.canonical_product_id,
      platform: listing.platform as Platform,
      platform_product_id: listing.platform_product_id,
      seller_id: listing.seller_id,
      seller_name: listing.seller_name,
      seller_tier: listing.seller_tier as SellerTier | null,
      raw_url: listing.raw_url,
      referral_url: listing.referral_url,
      is_active: listing.is_active,
      is_pinned_seller: listing.is_pinned_seller,
      condition: listing.condition as ListingCondition,
      added_at: listing.added_at,
      last_scraped_at: listing.last_scraped_at,
    }

    return response
  })

/**
 * Handler for GET /api/listings
 * Lists all listings with optional filters
 */
const listListingsHandler = (queryParams: Record<string, string | undefined>) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // Parse and validate query parameters
    const filters: ListingListFilters = {}

    if (queryParams.canonical_product_id) {
      filters.canonical_product_id = queryParams.canonical_product_id
    }
    if (queryParams.platform) {
      const platformResult = yield* _(
        Schema.decodeUnknown(PlatformSchema)(queryParams.platform).pipe(
          Effect.mapError(
            () =>
              new ValidationError({
                message: `Invalid platform value: ${queryParams.platform}`,
                fields: ['platform'],
              })
          )
        )
      )
      filters.platform = platformResult as Platform
    }
    if (queryParams.is_active !== undefined) {
      filters.is_active = queryParams.is_active === 'true'
    }
    if (queryParams.condition) {
      const conditionResult = yield* _(
        Schema.decodeUnknown(ConditionSchema)(queryParams.condition).pipe(
          Effect.mapError(
            () =>
              new ValidationError({
                message: `Invalid condition value: ${queryParams.condition}`,
                fields: ['condition'],
              })
          )
        )
      )
      filters.condition = conditionResult as ListingCondition
    }

    // Only show active listings by default (unless explicitly requested otherwise)
    const activeOnly = filters.is_active === undefined ? true : false

    const listings = yield* _(
      Effect.tryPromise(() => findAllListings(env.DB, filters, activeOnly))
    )

    const response: ListingListResponse = {
      listings: listings.map((listing) => ({
        ...listing,
        platform: listing.platform as Platform,
        seller_tier: listing.seller_tier as SellerTier | null,
        condition: listing.condition as ListingCondition,
      })),
      total: listings.length,
    }

    return response
  })

/**
 * Handler for GET /api/listings/:id
 * Gets a single listing by ID
 */
const getListingHandler = (id: string) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    const listing = yield* _(
      Effect.tryPromise(() => findListingById(env.DB, id)).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: `Listing with id '${id}' not found`,
                  resource: 'platform_listing',
                })
              )
            : Effect.succeed(result)
        )
      )
    )

    return {
      ...listing,
      platform: listing.platform as Platform,
      seller_tier: listing.seller_tier as SellerTier | null,
      condition: listing.condition as ListingCondition,
    }
  })

/**
 * Handler for PATCH /api/listings/:id
 * Partially updates a listing
 */
const updateListingHandler = (id: string, body: unknown) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // 1. Validate request body
    const validated = yield* _(
      Schema.decodeUnknown(UpdateListingSchema)(body).pipe(
        Effect.mapError(
          (e) =>
            new ValidationError({
              message: 'Invalid request body',
              fields: Object.keys(e.issue),
            })
        )
      )
    )

    const updateData = validated as UpdateListingRequest

    // 2. Check if at least one field is provided
    if (Object.keys(updateData).length === 0) {
      yield* _(
        Effect.fail(
          new ValidationError({
            message: 'At least one field must be provided for update',
          })
        )
      )
    }

    // 3. Check if listing exists
    const existing = yield* _(
      Effect.tryPromise(() => findListingById(env.DB, id)).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: `Listing with id '${id}' not found`,
                  resource: 'platform_listing',
                })
              )
            : Effect.succeed(result)
        )
      )
    )

    // 4. Update listing
    const updated = yield* _(
      Effect.tryPromise(() => updateListing(env.DB, id, updateData))
    )

    return {
      ...updated,
      platform: updated!.platform as Platform,
      seller_tier: updated!.seller_tier as SellerTier | null,
      condition: updated!.condition as ListingCondition,
    }
  })

/**
 * Handler for DELETE /api/listings/:id
 * Soft deletes a listing (sets is_active = 0)
 */
const deleteListingHandler = (id: string) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // Check if listing exists first
    const existing = yield* _(
      Effect.tryPromise(() => findListingById(env.DB, id)).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: `Listing with id '${id}' not found`,
                  resource: 'platform_listing',
                })
              )
            : Effect.succeed(result)
        )
      )
    )

    // Soft delete
    yield* _(Effect.tryPromise(() => deleteListing(env.DB, id)))

    return { deleted: true }
  })

// =============================================================================
// Routes
// =============================================================================

const listingsRoutes = new Hono<HonoBindings>()

// POST /api/listings - Create new listing
listingsRoutes.post('/', async (c) => {
  const env = c.get('env')
  const body = await c.req.json().catch(() => ({}))

  const result = await Effect.runPromise(
    addListingHandler(body).pipe(
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

  return c.json(result.data, 201)
})

// GET /api/listings - List all listings
listingsRoutes.get('/', async (c) => {
  const env = c.get('env')
  const queryParams = {
    canonical_product_id: c.req.query('canonical_product_id'),
    platform: c.req.query('platform'),
    is_active: c.req.query('is_active'),
    condition: c.req.query('condition'),
  }

  const result = await Effect.runPromise(
    listListingsHandler(queryParams).pipe(
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

// GET /api/listings/:id - Get listing by ID
listingsRoutes.get('/:id', async (c) => {
  const env = c.get('env')
  const id = c.req.param('id')

  const result = await Effect.runPromise(
    getListingHandler(id).pipe(
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

// PATCH /api/listings/:id - Update listing (partial update)
listingsRoutes.patch('/:id', async (c) => {
  const env = c.get('env')
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))

  const result = await Effect.runPromise(
    updateListingHandler(id, body).pipe(
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

// DELETE /api/listings/:id - Soft delete listing
listingsRoutes.delete('/:id', async (c) => {
  const env = c.get('env')
  const id = c.req.param('id')

  const result = await Effect.runPromise(
    deleteListingHandler(id).pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: () => ({ success: true } as const),
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

  return c.body(null, 204)
})

export { listingsRoutes }
