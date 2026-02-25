# =============================================================================
# Listings API Tests
# =============================================================================
# Comprehensive tests for the Listings CRUD endpoints.
# Tests cover: create, read, update, delete, and error cases.
# Note: Listings require an existing canonical product.

# =============================================================================
# SETUP - Create prerequisite products
# =============================================================================

# -----------------------------------------------------------------------------
# Setup: Create a product for listing tests
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "listing-test-product",
  "name": "Listing Test Product",
  "category": "Electronics"
}
HTTP 201
[Captures]
listing_product_id: jsonpath "$.id"

# -----------------------------------------------------------------------------
# Setup: Create another product for filter tests
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "listing-test-product-2",
  "name": "Listing Test Product 2",
  "category": "Gaming"
}
HTTP 201

# =============================================================================
# CREATE LISTING TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Create listing with minimal required fields (201 Created)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "tokopedia",
  "seller_name": "Test Seller",
  "raw_url": "https://tokopedia.com/test-product"
}
HTTP 201
[Asserts]
jsonpath "$.id" exists
jsonpath "$.canonical_product_id" == "listing-test-product"
jsonpath "$.platform" == "tokopedia"
jsonpath "$.seller_name" == "Test Seller"
jsonpath "$.raw_url" == "https://tokopedia.com/test-product"
jsonpath "$.is_active" == 1
jsonpath "$.is_pinned_seller" == 1
jsonpath "$.condition" == "new"
jsonpath "$.added_at" exists
[Captures]
listing_id: jsonpath "$.id"

# -----------------------------------------------------------------------------
# Test: Create listing with all fields (201 Created)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "shopee",
  "platform_product_id": "SHOP-123",
  "seller_id": "seller-123",
  "seller_name": "Full Fields Seller",
  "seller_tier": "official_store",
  "raw_url": "https://shopee.co.id/test-product",
  "condition": "used",
  "is_pinned_seller": false
}
HTTP 201
[Asserts]
jsonpath "$.platform_product_id" == "SHOP-123"
jsonpath "$.seller_id" == "seller-123"
jsonpath "$.seller_tier" == "official_store"
jsonpath "$.condition" == "used"
jsonpath "$.is_pinned_seller" == 0

# -----------------------------------------------------------------------------
# Test: Create listing for different platforms (201 Created)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "blibli",
  "seller_name": "Blibli Seller",
  "raw_url": "https://blibli.com/test"
}
HTTP 201
[Asserts]
jsonpath "$.platform" == "blibli"
[Captures]
blibli_listing_id: jsonpath "$.id"

# -----------------------------------------------------------------------------
# Test: Create listing for Lazada (201 Created)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "lazada",
  "seller_name": "Lazada Seller",
  "raw_url": "https://lazada.co.id/test"
}
HTTP 201
[Asserts]
jsonpath "$.platform" == "lazada"

# -----------------------------------------------------------------------------
# Test: Create listing for TikTok Shop (201 Created)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "tiktokshop",
  "seller_name": "TikTok Seller",
  "raw_url": "https://tiktok.com/shop/test"
}
HTTP 201
[Asserts]
jsonpath "$.platform" == "tiktokshop"

# -----------------------------------------------------------------------------
# Test: Create listing for non-existent product (404 Not Found)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "non-existent-product",
  "platform": "tokopedia",
  "seller_name": "Test Seller",
  "raw_url": "https://tokopedia.com/test"
}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"
jsonpath "$.message" == "Canonical product with id 'non-existent-product' not found"

# -----------------------------------------------------------------------------
# Test: Create listing with invalid platform (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "invalid_platform",
  "seller_name": "Test Seller",
  "raw_url": "https://test.com/product"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"
jsonpath "$.message" == "Invalid request body"

# -----------------------------------------------------------------------------
# Test: Create listing with invalid seller_tier (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "tokopedia",
  "seller_name": "Test Seller",
  "seller_tier": "invalid_tier",
  "raw_url": "https://tokopedia.com/test"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: Create listing with invalid condition (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "tokopedia",
  "seller_name": "Test Seller",
  "condition": "refurbished",
  "raw_url": "https://tokopedia.com/test"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: Create listing with empty seller_name (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "tokopedia",
  "seller_name": "",
  "raw_url": "https://tokopedia.com/test"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: Create listing without required fields (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "platform": "tokopedia"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# =============================================================================
# LIST LISTINGS TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: List all listings (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.listings" exists
jsonpath "$.total" >= 5
jsonpath "$.listings[0].id" exists
jsonpath "$.listings[0].platform" exists
jsonpath "$.listings[0].seller_name" exists

# -----------------------------------------------------------------------------
# Test: Filter listings by canonical_product_id (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings?canonical_product_id={{listing_product_id}}
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.listings" exists

# -----------------------------------------------------------------------------
# Test: Filter listings by platform (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings?platform=tokopedia
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.listings" exists

# -----------------------------------------------------------------------------
# Test: Filter listings by condition (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings?condition=used
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.listings" exists

# -----------------------------------------------------------------------------
# Test: Filter listings with invalid platform (400 Validation Error)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings?platform=invalid
Authorization: Bearer {{api_key}}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# =============================================================================
# GET LISTING TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Get listing by ID (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{listing_id}}"
jsonpath "$.canonical_product_id" == "listing-test-product"
jsonpath "$.platform" == "tokopedia"
jsonpath "$.seller_name" == "Test Seller"

# -----------------------------------------------------------------------------
# Test: Get non-existent listing (404 Not Found)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{api_key}}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"
jsonpath "$.message" == "Listing with id '00000000-0000-0000-0000-000000000000' not found"

# =============================================================================
# UPDATE LISTING TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Update listing seller_name (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "seller_name": "Updated Seller Name"
}
HTTP 200
[Asserts]
jsonpath "$.seller_name" == "Updated Seller Name"

# -----------------------------------------------------------------------------
# Test: Update listing seller_tier (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "seller_tier": "mall"
}
HTTP 200
[Asserts]
jsonpath "$.seller_tier" == "mall"

# -----------------------------------------------------------------------------
# Test: Update listing raw_url (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "raw_url": "https://tokopedia.com/updated-url"
}
HTTP 200
[Asserts]
jsonpath "$.raw_url" == "https://tokopedia.com/updated-url"

# -----------------------------------------------------------------------------
# Test: Update multiple fields (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "seller_name": "Multi Update Seller",
  "seller_tier": "verified",
  "condition": "used"
}
HTTP 200
[Asserts]
jsonpath "$.seller_name" == "Multi Update Seller"
jsonpath "$.seller_tier" == "verified"
jsonpath "$.condition" == "used"

# -----------------------------------------------------------------------------
# Test: Deactivate listing (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "is_active": false
}
HTTP 200
[Asserts]
jsonpath "$.is_active" == 0

# -----------------------------------------------------------------------------
# Test: Reactivate listing (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "is_active": true
}
HTTP 200
[Asserts]
jsonpath "$.is_active" == 1

# -----------------------------------------------------------------------------
# Test: Unpin seller (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "is_pinned_seller": false
}
HTTP 200
[Asserts]
jsonpath "$.is_pinned_seller" == 0

# -----------------------------------------------------------------------------
# Test: Update with empty body (400 Validation Error)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"
jsonpath "$.message" == "At least one field must be provided for update"

# -----------------------------------------------------------------------------
# Test: Update non-existent listing (404 Not Found)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{api_key}}
{
  "seller_name": "This should fail"
}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"

# -----------------------------------------------------------------------------
# Test: Update with invalid seller_tier (400 Validation Error)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "seller_tier": "invalid_tier"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# =============================================================================
# DELETE LISTING TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Create a listing for deletion
# -----------------------------------------------------------------------------
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{listing_product_id}}",
  "platform": "tokopedia",
  "seller_name": "Seller To Delete",
  "raw_url": "https://tokopedia.com/to-delete"
}
HTTP 201
[Captures]
delete_listing_id: jsonpath "$.id"

# -----------------------------------------------------------------------------
# Test: Delete listing (204 No Content)
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/listings/{{delete_listing_id}}
Authorization: Bearer {{api_key}}
HTTP 204

# -----------------------------------------------------------------------------
# Test: Soft-deleted listing has is_active = 0
# Note: Soft delete means record still exists but is inactive
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings/{{delete_listing_id}}
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{delete_listing_id}}"
jsonpath "$.is_active" == 0

# -----------------------------------------------------------------------------
# Test: Delete non-existent listing (404 Not Found)
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/listings/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{api_key}}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"

# =============================================================================
# CLEANUP - Delete remaining test data
# =============================================================================
# Note: We capture listing_id and blibli_listing_id from POST requests above
# If those requests failed, the variables won't be defined, but that's okay
# since cleanup is best-effort

# -----------------------------------------------------------------------------
# Cleanup: Delete the main test listing
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
HTTP 204

# -----------------------------------------------------------------------------
# Cleanup: Delete test products
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/products/listing-test-product
Authorization: Bearer {{api_key}}
HTTP 204

DELETE {{base_url}}/api/products/listing-test-product-2
Authorization: Bearer {{api_key}}
HTTP 204
