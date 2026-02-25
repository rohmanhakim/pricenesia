#!/bin/bash
# =============================================================================
# Reset Local D1 Database for Deterministic Testing
# =============================================================================
# This script clears the local D1 database to ensure tests run in a clean state.
# Run this before Hurl tests for deterministic results.
#
# Usage: ./reset-db.sh [env-file]
#   env-file - Path to env file (default: .env)

set -e

# Get env file from argument or default to .env
ENV_FILE="${1:-.env}"

# Load DB_NAME from env file
if [ -f "$ENV_FILE" ]; then
  export DB_NAME=$(grep "^DB_NAME=" "$ENV_FILE" | cut -d'=' -f2)
  echo "📋 Using database: $DB_NAME (from $ENV_FILE)"
else
  echo "❌ Error: Env file not found: $ENV_FILE"
  exit 1
fi

echo "🧹 Resetting local D1 database..."

# Delete all listings first (due to foreign key constraints)
wrangler d1 execute $DB_NAME --local --command "DELETE FROM platform_listings" 2>/dev/null || true

# Delete all test products (keep the seed product sony-ps4-slim-1tb-cuh2006)
wrangler d1 execute $DB_NAME --local --command "DELETE FROM canonical_products WHERE id NOT IN ('sony-ps4-slim-1tb-cuh2006')" 2>/dev/null || true

echo "✅ Database reset complete"