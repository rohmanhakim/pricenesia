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