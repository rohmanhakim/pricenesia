// =============================================================================
// Pricenesia Ingestion API - Products Routes
// =============================================================================

import { Effect, Layer, Schema } from 'effect'
import { Hono } from 'hono'
import { WorkerEnv, HonoBindings } from '../context'
import { NotFoundError, ConflictError, ValidationError } from '../errors'
import {
  insertCanonicalProduct,
  canonicalProductExists,
  findCanonicalProductById,
  findAllCanonicalProducts,
} from '@pricenesia/shared/db'
import type { AddProductRequest, AddProductResponse, ProductListResponse } from '@pricenesia/shared/types'

// =============================================================================
// Validation Schemas
// =============================================================================

/**
 * Slug validation: lowercase alphanumeric with dashes, no leading/trailing dashes
 */
const SlugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/

const AddProductSchema = Schema.Struct({
  id: Schema.String.pipe(
    Schema.pattern(SlugPattern),
    Schema.minLength(3),
    Schema.maxLength(100)
  ),
  name: Schema.String.pipe(
    Schema.nonEmptyString(),
    Schema.minLength(1),
    Schema.maxLength(255)
  ),
  category: Schema.optional(Schema.String.pipe(Schema.maxLength(100))),
  model_number: Schema.optional(Schema.String.pipe(Schema.maxLength(100))),
  image_url: Schema.optional(Schema.String.pipe(Schema.maxLength(500))),
})

// =============================================================================
// Handlers
// =============================================================================

/**
 * Handler for POST /api/products
 * Creates a new canonical product
 */
const addProductHandler = (body: unknown) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    // 1. Validate request body
    const validated = yield* _(
      Schema.decodeUnknown(AddProductSchema)(body).pipe(
        Effect.mapError(
          (e) =>
            new ValidationError({
              message: 'Invalid request body',
              fields: Object.keys(e.issue),
            })
        )
      )
    )

    const { id, name, category, model_number, image_url } = validated as AddProductRequest

    // 2. Check for duplicate product ID
    const exists = yield* _(
      Effect.tryPromise(() => canonicalProductExists(env.DB, id))
    )

    if (exists) {
      yield* _(
        Effect.fail(
          new ConflictError({
            message: `Product with id '${id}' already exists`,
            resource: 'canonical_product',
          })
        )
      )
    }

    // 3. Insert product
    yield* _(
      Effect.tryPromise(() =>
        insertCanonicalProduct(env.DB, {
          id,
          name,
          category,
          model_number,
          image_url,
        })
      )
    )

    // 4. Fetch and return created product
    const product = yield* _(
      Effect.tryPromise(() => findCanonicalProductById(env.DB, id)).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: 'Failed to retrieve created product',
                  resource: 'canonical_product',
                })
              )
            : Effect.succeed(result)
        )
      )
    )

    const response: AddProductResponse = {
      id: product.id,
      name: product.name,
      category: product.category,
      model_number: product.model_number,
      image_url: product.image_url,
      is_active: product.is_active,
      created_at: product.created_at,
    }

    return response
  })

/**
 * Handler for GET /api/products
 * Lists all canonical products
 */
const listProductsHandler = () =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    const products = yield* _(
      Effect.tryPromise(() => findAllCanonicalProducts(env.DB))
    )

    const response: ProductListResponse = {
      products,
      total: products.length,
    }

    return response
  })

/**
 * Handler for GET /api/products/:id
 * Gets a single product by ID
 */
const getProductHandler = (id: string) =>
  Effect.gen(function* (_) {
    const env = yield* _(WorkerEnv)

    const product = yield* _(
      Effect.tryPromise(() => findCanonicalProductById(env.DB, id)).pipe(
        Effect.flatMap((result) =>
          result === null
            ? Effect.fail(
                new NotFoundError({
                  message: `Product with id '${id}' not found`,
                  resource: 'canonical_product',
                })
              )
            : Effect.succeed(result)
        )
      )
    )

    return product
  })

// =============================================================================
// Routes
// =============================================================================

const productsRoutes = new Hono<HonoBindings>()

// POST /api/products - Create new product
productsRoutes.post('/', async (c) => {
  const env = c.get('env')
  const body = await c.req.json().catch(() => ({}))

  const result = await Effect.runPromise(
    addProductHandler(body).pipe(
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
      case 'ConflictError':
        return c.json({ error: 'Conflict', message: error.message }, 409)
      default:
        return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500)
    }
  }

  return c.json(result.data, 201)
})

// GET /api/products - List all products
productsRoutes.get('/', async (c) => {
  const env = c.get('env')

  const result = await Effect.runPromise(
    listProductsHandler().pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: (data) => ({ success: true, data } as const),
        onFailure: (error) => ({ success: false, error } as const),
      })
    )
  )

  if (!result.success) {
    return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500)
  }

  return c.json(result.data)
})

// GET /api/products/:id - Get product by ID
productsRoutes.get('/:id', async (c) => {
  const env = c.get('env')
  const id = c.req.param('id')

  const result = await Effect.runPromise(
    getProductHandler(id).pipe(
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

export { productsRoutes }