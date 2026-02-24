// =============================================================================
// Pricenesia Ingestion API - Tagged Errors
// =============================================================================

import { Schema } from 'effect'

// =============================================================================
// Auth Errors
// =============================================================================

/**
 * Error thrown when Authorization header is missing or malformed
 */
export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>(
  'UnauthorizedError'
)('UnauthorizedError', {
  message: Schema.String,
}) {}

/**
 * Error thrown when API key is invalid
 */
export class ForbiddenError extends Schema.TaggedError<ForbiddenError>(
  'ForbiddenError'
)('ForbiddenError', {
  message: Schema.String,
}) {}

// =============================================================================
// Validation Errors
// =============================================================================

/**
 * Error thrown when request validation fails
 */
export class ValidationError extends Schema.TaggedError<ValidationError>(
  'ValidationError'
)('ValidationError', {
  message: Schema.String,
  fields: Schema.optional(Schema.Array(Schema.String)),
}) {}

// =============================================================================
// Resource Errors
// =============================================================================

/**
 * Error thrown when a requested resource is not found
 */
export class NotFoundError extends Schema.TaggedError<NotFoundError>(
  'NotFoundError'
)('NotFoundError', {
  message: Schema.String,
  resource: Schema.String,
}) {}

/**
 * Error thrown when a resource already exists (conflict)
 */
export class ConflictError extends Schema.TaggedError<ConflictError>(
  'ConflictError'
)('ConflictError', {
  message: Schema.String,
  resource: Schema.String,
}) {}
