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
│                     HTTP Handlers                            │
│  (Route handling, request parsing, response formatting)      │
├─────────────────────────────────────────────────────────────┤
│                     Service Layer                            │
│  (Business logic, validation, error handling)                │
├─────────────────────────────────────────────────────────────┤
│                   Repository Layer                           │
│  (Database operations, data access)                          │
├─────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                       │
│  (D1 database, external services, configuration)             │
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

## Next Steps

1. Run `pnpm install` in the project root
2. Review `packages/ingestion-api/src/effect-example.ts`
3. Start integrating Effect-TS patterns into your handlers
4. Consider migrating existing code gradually using the layered architecture

## Benefits for Pricenesia

- **Type Safety**: Catch errors at compile time
- **Testability**: Mock dependencies easily with Layers
- **Maintainability**: Clear separation of concerns
- **Error Handling**: Comprehensive error types and recovery
- **Concurrency**: Built-in patterns for parallel operations (useful for scraping)