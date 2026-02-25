# =============================================================================
# Products API Tests
# =============================================================================
# Comprehensive tests for the Products CRUD endpoints.
# Tests cover: create, read, update, delete, and error cases.

# =============================================================================
# CREATE PRODUCT TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Create product with minimal required fields (201 Created)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "test-product-1",
  "name": "Test Product 1"
}
HTTP 201
[Asserts]
jsonpath "$.id" == "test-product-1"
jsonpath "$.name" == "Test Product 1"
jsonpath "$.is_active" == 1
jsonpath "$.created_at" exists
[Captures]
product_id: jsonpath "$.id"

# -----------------------------------------------------------------------------
# Test: Create product with all fields (201 Created)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "test-product-full",
  "name": "Test Product Full",
  "category": "Electronics",
  "model_number": "MODEL-123",
  "image_url": "https://example.com/image.jpg"
}
HTTP 201
[Asserts]
jsonpath "$.id" == "test-product-full"
jsonpath "$.name" == "Test Product Full"
jsonpath "$.category" == "Electronics"
jsonpath "$.model_number" == "MODEL-123"
jsonpath "$.image_url" == "https://example.com/image.jpg"

# -----------------------------------------------------------------------------
# Test: Create product with duplicate ID (409 Conflict)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "test-product-1",
  "name": "Duplicate Product"
}
HTTP 409
[Asserts]
jsonpath "$.error" == "Conflict"
jsonpath "$.message" == "Product with id 'test-product-1' already exists"

# -----------------------------------------------------------------------------
# Test: Create product with invalid ID format (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "Invalid ID!",
  "name": "Invalid ID Product"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"
jsonpath "$.message" == "Invalid request body"

# -----------------------------------------------------------------------------
# Test: Create product with ID too short (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "ab",
  "name": "Short ID Product"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: Create product with ID too long (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "a-very-long-product-id-that-exceeds-the-maximum-allowed-length-of-100-characters-which-should-fail-validation",
  "name": "Long ID Product"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: Create product with empty name (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "test-product-empty-name",
  "name": ""
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: Create product without required fields (400 Validation Error)
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "test-product-no-name"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# =============================================================================
# LIST PRODUCTS TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: List all products (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/products
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.products" exists
jsonpath "$.total" >= 2
jsonpath "$.products[0].id" exists
jsonpath "$.products[0].name" exists

# =============================================================================
# GET PRODUCT TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Get product by ID (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.id" == "test-product-1"
jsonpath "$.name" == "Test Product 1"
jsonpath "$.is_active" == 1

# -----------------------------------------------------------------------------
# Test: Get product with full fields (200 OK)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/products/test-product-full
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.id" == "test-product-full"
jsonpath "$.name" == "Test Product Full"
jsonpath "$.category" == "Electronics"
jsonpath "$.model_number" == "MODEL-123"
jsonpath "$.image_url" == "https://example.com/image.jpg"

# -----------------------------------------------------------------------------
# Test: Get non-existent product (404 Not Found)
# -----------------------------------------------------------------------------
GET {{base_url}}/api/products/non-existent-product
Authorization: Bearer {{api_key}}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"
jsonpath "$.message" == "Product with id 'non-existent-product' not found"

# =============================================================================
# UPDATE PRODUCT TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Update product name (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
{
  "name": "Updated Test Product 1"
}
HTTP 200
[Asserts]
jsonpath "$.id" == "test-product-1"
jsonpath "$.name" == "Updated Test Product 1"

# -----------------------------------------------------------------------------
# Test: Update product category (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
{
  "category": "Updated Category"
}
HTTP 200
[Asserts]
jsonpath "$.category" == "Updated Category"

# -----------------------------------------------------------------------------
# Test: Update multiple fields (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
{
  "name": "Fully Updated Product",
  "category": "New Category",
  "model_number": "NEW-MODEL",
  "image_url": "https://example.com/new-image.jpg"
}
HTTP 200
[Asserts]
jsonpath "$.name" == "Fully Updated Product"
jsonpath "$.category" == "New Category"
jsonpath "$.model_number" == "NEW-MODEL"
jsonpath "$.image_url" == "https://example.com/new-image.jpg"

# -----------------------------------------------------------------------------
# Test: Update with empty body (400 Validation Error)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
{}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"
jsonpath "$.message" == "At least one field must be provided for update"

# -----------------------------------------------------------------------------
# Test: Update non-existent product (404 Not Found)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/products/non-existent-product
Authorization: Bearer {{api_key}}
{
  "name": "This should fail"
}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"

# -----------------------------------------------------------------------------
# Test: Update with invalid field value (400 Validation Error)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
{
  "name": ""
}
HTTP 400
[Asserts]
jsonpath "$.error" == "Validation Error"

# -----------------------------------------------------------------------------
# Test: Deactivate product via is_active field (200 OK)
# -----------------------------------------------------------------------------
PATCH {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
{
  "is_active": false
}
HTTP 200
[Asserts]
jsonpath "$.is_active" == 0

# =============================================================================
# DELETE PRODUCT TESTS
# =============================================================================

# -----------------------------------------------------------------------------
# Test: Create a product for deletion
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "product-to-delete",
  "name": "Product To Delete"
}
HTTP 201
[Captures]
delete_product_id: jsonpath "$.id"

# -----------------------------------------------------------------------------
# Test: Delete product (204 No Content)
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/products/{{delete_product_id}}
Authorization: Bearer {{api_key}}
HTTP 204

# -----------------------------------------------------------------------------
# Test: Soft-deleted product has is_active = 0
# Note: Soft delete means record still exists but is inactive
# -----------------------------------------------------------------------------
GET {{base_url}}/api/products/{{delete_product_id}}
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{delete_product_id}}"
jsonpath "$.is_active" == 0

# -----------------------------------------------------------------------------
# Test: Delete non-existent product (404 Not Found)
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/products/non-existent-product
Authorization: Bearer {{api_key}}
HTTP 404
[Asserts]
jsonpath "$.error" == "Not Found"

# =============================================================================
# CLEANUP - Delete remaining test products
# =============================================================================

# -----------------------------------------------------------------------------
# Cleanup: Delete test-product-1
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/products/test-product-1
Authorization: Bearer {{api_key}}
HTTP 204

# -----------------------------------------------------------------------------
# Cleanup: Delete test-product-full
# -----------------------------------------------------------------------------
DELETE {{base_url}}/api/products/test-product-full
Authorization: Bearer {{api_key}}
HTTP 204