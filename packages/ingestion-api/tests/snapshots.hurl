# =============================================================================
# Snapshots API Tests
# =============================================================================
# Comprehensive tests for the Snapshots endpoints.
# Tests cover: list all snapshots, get latest, get history, flagged snapshots.

# =============================================================================
# SETUP - Create prerequisite products and listings
# =============================================================================

# -----------------------------------------------------------------------------
# Setup: Create a product for snapshot tests
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "snapshot-test-product",
  "name": "Snapshot Test Product"
}
HTTP 201
[Captures]
snapshot_product_id: jsonpath "$.id"

# -----------------------------------------------------------------------------
# Setup: Create a listing for snapshot tests
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{snapshot_product_id}}",
  "platform": "tokopedia",
  "seller_name": "Snapshot Test Seller",
  "raw_url": "https://tokopedia.com/snapshot-test"
}
HTTP 201
[Captures]
snapshot_listing_id: jsonpath "$.id"

# =============================================================================
# AUTH TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Snapshots endpoint requires authentication
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"

# -----------------------------------------------------------------------------
# Test: Latest snapshot endpoint requires authentication
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/{{snapshot_listing_id}}/latest
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"

# -----------------------------------------------------------------------------
# Test: History endpoint requires authentication
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/{{snapshot_listing_id}}/history
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"

# -----------------------------------------------------------------------------
# Test: Flagged snapshots endpoint requires authentication
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/flagged
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"

# -----------------------------------------------------------------------------
# Test: Review flagged snapshot requires authentication
# -----------------------------------------------------------------------------
POST {{base_url}}/api/snapshots/flagged/00000000-0000-0000-0000-000000000000/review
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"

# =============================================================================
# LIST ALL SNAPSHOTS TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: List all snapshots (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.snapshots" exists
jsonpath "$.total" exists
jsonpath "$.limit" exists
jsonpath "$.offset" exists

# -----------------------------------------------------------------------------
# Test: List snapshots with platform filter (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots?platform=tokopedia
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.snapshots" exists

# -----------------------------------------------------------------------------
# Test: List snapshots with invalid platform (400 Validation Error)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots?platform=invalid
Authorization: Bearer {{api_key}}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: List snapshots with date filters (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots?from=2024-01-01&to=2024-12-31
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.snapshots" exists

# -----------------------------------------------------------------------------
# Test: List snapshots with invalid date format (400 Validation Error)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots?from=invalid-date
Authorization: Bearer {{api_key}}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: List snapshots with pagination (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots?limit=10&offset=0
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.limit" == 10
jsonpath "$.offset" == 0

# -----------------------------------------------------------------------------
# Test: List snapshots with invalid limit (400 Validation Error)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots?limit=0
Authorization: Bearer {{api_key}}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: List snapshots with limit over max (400 Validation Error)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots?limit=200
Authorization: Bearer {{api_key}}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# =============================================================================
# GET LATEST SNAPSHOT TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Get latest snapshot for non-existent listing (404 Not Found)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/00000000-0000-0000-0000-000000000000/latest
Authorization: Bearer {{api_key}}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"
jsonpath "$.message" == "Listing with id '00000000-0000-0000-0000-000000000000' not found"

# -----------------------------------------------------------------------------
# Test: Get latest snapshot for listing with no snapshots (404 Not Found)
# Note: This listing exists but has no snapshots yet
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/{{snapshot_listing_id}}/latest
Authorization: Bearer {{api_key}}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"
jsonpath "$.message" contains "No price snapshot found"

# =============================================================================
# GET HISTORY TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Get history for non-existent listing (404 Not Found)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/00000000-0000-0000-0000-000000000000/history
Authorization: Bearer {{api_key}}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"
jsonpath "$.message" == "Listing with id '00000000-0000-0000-0000-000000000000' not found"

# -----------------------------------------------------------------------------
# Test: Get history for listing with no snapshots (200 OK, empty)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/{{snapshot_listing_id}}/history
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.snapshots" exists
jsonpath "$.total" == 0
jsonpath "$.listing_id" == "{{snapshot_listing_id}}"

# -----------------------------------------------------------------------------
# Test: Get history with date filters (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/{{snapshot_listing_id}}/history?from=2024-01-01&to=2024-12-31
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.snapshots" exists

# -----------------------------------------------------------------------------
# Test: Get history with pagination (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/{{snapshot_listing_id}}/history?limit=10&offset=0
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.limit" == 10
jsonpath "$.offset" == 0

# -----------------------------------------------------------------------------
# Test: Get history with invalid date format (400 Validation Error)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/listings/{{snapshot_listing_id}}/history?from=invalid
Authorization: Bearer {{api_key}}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# =============================================================================
# FLAGGED SNAPSHOTS TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: List flagged snapshots (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/flagged
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.flagged_snapshots" exists
jsonpath "$.total" exists

# -----------------------------------------------------------------------------
# Test: List flagged snapshots with platform filter (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/flagged?platform=tokopedia
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.flagged_snapshots" exists

# -----------------------------------------------------------------------------
# Test: List flagged snapshots with invalid platform (400 Validation Error)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/flagged?platform=invalid
Authorization: Bearer {{api_key}}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: List flagged snapshots with pagination (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/snapshots/flagged?limit=10&offset=0
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.limit" == 10
jsonpath "$.offset" == 0

# =============================================================================
# REVIEW FLAGGED SNAPSHOT TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Review non-existent flagged snapshot (404 Not Found)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/snapshots/flagged/00000000-0000-0000-0000-000000000000/review
Authorization: Bearer {{api_key}}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"
jsonpath "$.message" == "Flagged snapshot with id '00000000-0000-0000-0000-000000000000' not found"

# =============================================================================
# CLEANUP - Delete test data
# =============================================================================

# -----------------------------------------------------------------------------
# Cleanup: Delete test listing
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/listings/{{snapshot_listing_id}}
Authorization: Bearer {{api_key}}
HTTP 204

# -----------------------------------------------------------------------------
# Cleanup: Delete test product
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/products/{{snapshot_product_id}}
Authorization: Bearer {{api_key}}
HTTP 204