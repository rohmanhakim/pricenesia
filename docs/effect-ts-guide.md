# Effect-TS Integration Guide for Cloudflare Workers

This guide explains how to use Effect-TS with Cloudflare Workers and D1 database in the Pricenesia project.

## What is Effect-TS?

[Effect-TS](https://effect.website/) is a powerful functional programming library for TypeScript that provides:

- **Structured Error Handling**: Type-safe errors with tagged error types
- **Dependency Injection**: Built-in Context and Layer system for DI
- **Composable Operations**: Chain operations with the Effect monad
- **Built-in Concurrency**: Fibers, race, timeout, retry patterns
- **Schema Validation**: Runtime type validation with Schema module

## Installation

Dependencies have been added to `packages/ingestion-api/package.json`:

```json
{
  "dependencies": {
    "effect": "^3.0.0",
    "@effect/platform": "^0.70.0",
    "@effect/sql": "^0.22.0",
    "@effect/sql-d1": "^0.22.0"
  }
}
```

Run `pnpm install` to install the packages.

## Key Packages

| Package | Purpose |
|---------|---------|
| `effect` | Core library - Effect monad, Context, Schema, Match, etc. |
| `@effect/platform` | Platform-independent abstractions (HTTP, FileSystem, etc.) |
| `@effect/sql` | SQL abstraction layer with type-safe queries |
| `@effect/sql-d1` | D1 database adapter for Cloudflare Workers |

## Architecture Overview

Effect-TS promotes a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Handlers                           │
│  (Route handling, request parsing, response formatting)     │
├─────────────────────────────────────────────────────────────┤
│                     Service Layer                           │
│  (Business logic, validation, error handling)               │
├─────────────────────────────────────────────────────────────┤
│                   Repository Layer                          │
│  (Database operations, data access)                         │
├─────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                      │
│  (D1 database, external services, configuration)            │
└─────────────────────────────────────────────────────────────┘
```

## Example Usage

See `packages/ingestion-api/src/effect-example.ts` for a complete example. Here's a summary:

### 1. Define Schemas

```typescript
import { Schema } from "effect";

export const CreateProductRequestSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  category: Schema.String.pipe(Schema.optional),
});
```

### 2. Define Tagged Errors

```typescript
import { Schema } from "effect";

export class ProductNotFoundError extends Schema.TaggedError<ProductNotFoundError>(
  "ProductNotFoundError"
)("ProductNotFoundError", {
  id: Schema.String,
}) {}
```

### 3. Create Context Tags

```typescript
import { Context } from "effect";

export const WorkerEnv = Context.GenericTag<WorkerEnv>("WorkerEnv");
export const ProductService = Context.GenericTag<ProductService>("ProductService");
```

### 4. Create Repository Layer

```typescript
import { Layer, Effect } from "effect";
import { SqlClient } from "@effect/sql";
import { D1ClientLayer } from "@effect/sql-d1";

export const ProductRepositoryLive = Layer.effect(
  ProductRepository,
  Effect.gen(function* (_) {
    const sql = yield* _(SqlClient.SqlClient);
    
    return ProductRepository.of({
      findById: (id) => sql`SELECT * FROM products WHERE id = ${id}`,
    });
  })
);
```

### 5. Create Service Layer

```typescript
export const ProductServiceLive = Layer.effect(
  ProductService,
  Effect.gen(function* (_) {
    const repo = yield* _(ProductRepository);
    
    return ProductService.of({
      getProduct: (id) =>
        repo.findById(id).pipe(
          Effect.flatMap((product) => 
            product 
              ? Effect.succeed(product) 
              : Effect.fail(new ProductNotFoundError({ id }))
          ),
        ),
    });
  })
);
```

### 6. Wire Everything in Worker

```typescript
import { Effect, Layer } from "@effect/platform";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const d1Layer = D1ClientLayer.layer({ db: env.DB });
    const envLayer = Layer.succeed(WorkerEnv, env);
    const fullLayer = Layer.mergeAll(d1Layer, envLayer, AppLayer);
    
    return Effect.provide(handleRequest(request), fullLayer).pipe(
      Effect.runPromise,
    );
  },
};
```

## D1 Database Usage

The `@effect/sql-d1` package provides seamless D1 integration:

```typescript
import { SqlClient } from "@effect/sql";
import { D1ClientLayer } from "@effect/sql-d1";

// Create D1 layer
const d1Layer = D1ClientLayer.layer({ db: env.DB });

// Use in repository
const repo = Effect.gen(function* (_) {
  const sql = yield* _(SqlClient.SqlClient);
  
  // Type-safe template literal queries
  const products = yield* _(sql`SELECT * FROM products WHERE id = ${id}`);
  
  return products;
});
```

## Error Handling

Effect-TS provides powerful error handling:

```typescript
import { Match } from "effect";

const result = yield* _(
  ProductService.getProduct(id),
  Effect.match({
    onSuccess: (product) => successResponse(product),
    onFailure: (error) =>
      Match.value(error).pipe(
        Match.tag("ProductNotFoundError", () => errorResponse("Not found", 404)),
        Match.tag("SqlError", () => errorResponse("Database error", 500)),
        Match.orElse(() => errorResponse("Unknown error", 500)),
      ),
  }),
);
```

## Built-in Patterns

### Retry

```typescript
const result = yield* _(
  fetchWithRetry(),
  Effect.retry({
    times: 3,
    delay: Duration.seconds(1),
  }),
);
```

### Timeout

```typescript
const result = yield* _(
  slowOperation(),
  Effect.timeout(Duration.seconds(5)),
);
```

### Race

```typescript
const result = yield* _(
  Effect.race(fetchFromPrimary(), fetchFromBackup()),
);
```

## Resources

- [Effect-TS Documentation](https://effect.website/docs)
- [Effect-TS GitHub](https://github.com/Effect-TS/effect)
- [@effect/sql-d1 API Reference](https://effect-ts.github.io/effect/docs/sql-d1)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)

## Project Structure Reference

See `packages/ingestion-api/src/` for a reference implementation:

```
src/
├── index.ts          # Entry point + Hono app
├── context.ts        # Context tags for dependency injection
├── errors.ts         # Tagged errors for type-safe error handling
├── middleware/
│   └── auth.ts       # Auth middleware using Effect
└── routes/
    └── health.ts     # Route handlers using Effect
```

### context.ts

Defines environment bindings and Effect Context:

```typescript
import { Context } from 'effect'

export interface EnvBindings {
  ADMIN_API_KEY: string
  DB: D1Database
  ENVIRONMENT: string
}

export const WorkerEnv = Context.GenericTag<EnvBindings>('WorkerEnv')
```

### errors.ts

Tagged errors for type-safe error handling:

```typescript
import { Schema } from 'effect'

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>(
  'UnauthorizedError'
)('UnauthorizedError', { message: Schema.String }) {}
```

### middleware/auth.ts

Auth middleware using Effect for validation:

```typescript
import { Effect, Layer } from 'effect'
import { createMiddleware } from 'hono/factory'
import { WorkerEnv } from '../context'
import { UnauthorizedError, ForbiddenError } from '../errors'

export const authMiddleware = createMiddleware<HonoBindings>(async (c, next) => {
  const result = await Effect.runPromise(
    validateAuth(authHeader).pipe(
      Effect.provide(Layer.succeed(WorkerEnv, env)),
      Effect.match({
        onSuccess: () => ({ success: true }),
        onFailure: (error) => ({ success: false, error }),
      })
    )
  )
  // Handle result...
})
```

---

## Next Steps

1. Run `pnpm install` in the project root
2. Review `packages/ingestion-api/src/` for reference implementation
3. Start integrating Effect-TS patterns into your handlers
4. Consider migrating existing code gradually using the layered architecture

## Platform Adapters with Effect

The `@pricenesia/adapters` package uses Effect for platform-specific scraping adapters. This provides type-safe error handling and composable extraction logic.

### Adapter Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Platform Adapter                         │
│  (extract method returns Effect<ScrapedData, Error>)        │
├─────────────────────────────────────────────────────────────┤
│                    Extraction Logic                         │
│  (Effect.gen for composable operations)                     │
├─────────────────────────────────────────────────────────────┤
│                    Error Types                              │
│  (ScrapeError, ParseError, ValidationError)                 │
└─────────────────────────────────────────────────────────────┘
```

### Tagged Errors

Each adapter can fail with typed errors:

```typescript
import { Schema } from 'effect'

// Page loading/timeout errors
export class ScrapeError extends Schema.TaggedError<ScrapeError>('ScrapeError')(
  'ScrapeError',
  {
    reason: Schema.Literal('page_not_found', 'blocked', 'timeout', 'network_error'),
    message: Schema.String,
    raw_debug: Schema.optional(Schema.String),
  }
) {}

// Data parsing errors
export class ParseError extends Schema.TaggedError<ParseError>('ParseError')(
  'ParseError',
  {
    reason: Schema.Literal('json_parse_failed', 'dom_selector_failed', 'price_extraction_failed', 'invalid_data'),
    message: Schema.String,
    raw_debug: Schema.optional(Schema.String),
  }
) {}

// Data validation errors
export class ValidationError extends Schema.TaggedError<ValidationError>('ValidationError')(
  'ValidationError',
  {
    reason: Schema.Literal('zero_price', 'price_below_floor', 'change_too_large'),
    message: Schema.String,
    scraped_price: Schema.optional(Schema.Number),
    last_known_price: Schema.optional(Schema.Number),
  }
) {}
```

### Creating a Platform Adapter

```typescript
import { Effect } from 'effect'
import type { PlatformAdapter, ScrapedData, PuppeteerPage } from '@pricenesia/adapters'
import { ParseError, ValidationError } from '@pricenesia/adapters'

export const MyPlatformAdapter: PlatformAdapter = {
  name: 'myplatform',

  extract(page: unknown, _listing: Listing): Effect.Effect<ScrapedData, ParseError | ValidationError> {
    const puppeteerPage = page as PuppeteerPage

    return Effect.gen(function* (_) {
      // Use Effect.tryPromise for async page operations
      const data = yield* _(
        Effect.tryPromise({
          try: () => puppeteerPage.evaluate(() => {
            // Extract data from page
            return { price: 100000, seller: 'Seller Name' }
          }),
          catch: (error) => new ParseError({
            reason: 'json_parse_failed',
            message: 'Failed to extract data',
            raw_debug: String(error),
          }),
        })
      )

      // Validate and return
      if (!data.price || data.price <= 0) {
        return {
          price: null,
          original_price: null,
          stock_status: null,
          seller_name: data.seller,
          valid: false,
          flag_reason: 'zero_price',
        }
      }

      return {
        price: data.price,
        original_price: null,
        stock_status: 'available',
        seller_name: data.seller,
        valid: true,
      }
    })
  },
}
```

### Using Adapters

```typescript
import { Effect, Match } from 'effect'
import { getAdapter, runExtraction, runExtractionSafe } from '@pricenesia/adapters'

// Option 1: Get adapter and use Effect directly
const adapter = getAdapter('tokopedia')
const result = await Effect.runPromise(
  adapter.extract(page, listing).pipe(
    Effect.match({
      onSuccess: (data) => ({ ok: true, data }),
      onFailure: (error) => ({ ok: false, error }),
    })
  )
)

// Option 2: Use the helper function for Promise-based code
const data = await runExtraction('tokopedia', page)

// Option 3: Use safe execution with result object
const result = await runExtractionSafe('tokopedia', page)
if (result.success) {
  console.log('Price:', result.data.price)
} else {
  console.log('Error:', result.error.message)
}

// Option 4: Pattern match on error types
const result = await Effect.runPromise(
  adapter.extract(page, listing).pipe(
    Effect.match({
      onSuccess: (data) => ({ status: 'success', data }),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('ScrapeError', (e) => ({ status: 'scrape_failed', reason: e.reason })),
          Match.tag('ParseError', (e) => ({ status: 'parse_failed', reason: e.reason })),
          Match.tag('ValidationError', (e) => ({ status: 'validation_failed', reason: e.reason })),
          Match.orElse(() => ({ status: 'unknown_error' })),
        ),
    })
  )
)
```

### Error Handling Patterns

```typescript
import { Effect, Match } from 'effect'

// Retry on transient failures
const result = await Effect.runPromise(
  adapter.extract(page, listing).pipe(
    Effect.retry({
      times: 3,
      delay: Duration.seconds(2),
    }),
    Effect.timeout(Duration.seconds(30)),
    Effect.catchAll((error) => 
      Effect.succeed({
        price: null,
        valid: false,
        flag_reason: 'scrape_failed',
        raw_debug: error.message,
      })
    )
  )
)
```

### Testing Adapters

```typescript
import { Effect, Layer } from 'effect'
import { PageContext, TokopediaAdapter } from '@pricenesia/adapters'

// Create a mock page
const mockPage = {
  evaluate: async (fn: () => unknown) => ({
    props: { pageProps: { layoutData: { pdpGetLayout: { basicInfo: { price: 500000 } } } } }
  }),
  $eval: async () => null,
  waitForSelector: async () => {},
  url: () => 'https://tokopedia.com/test',
}

// Test extraction
const result = await Effect.runPromise(
  TokopediaAdapter.extract(mockPage, listing)
)

expect(result.valid).toBe(true)
expect(result.price).toBe(500000)
```

---

## Benefits for Pricenesia

- **Type Safety**: Catch errors at compile time
- **Testability**: Mock dependencies easily with Layers
- **Maintainability**: Clear separation of concerns
- **Error Handling**: Comprehensive error types and recovery
- **Concurrency**: Built-in patterns for parallel operations (useful for scraping)
- **Composability**: Chain adapter operations with Effect.gen
