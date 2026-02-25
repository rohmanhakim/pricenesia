# =============================================================================
# Authentication Tests
# =============================================================================
# Tests authentication middleware behavior for all endpoints.
# The API uses Bearer token authentication via the Authorization header.

# -----------------------------------------------------------------------------
# Test: Missing Authorization header returns 401 Unauthorized
# -----------------------------------------------------------------------------
GET {{base_url}}/health
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"
jsonpath "$.message" exists

# -----------------------------------------------------------------------------
# Test: Invalid Bearer token format returns 401 Unauthorized
# -----------------------------------------------------------------------------
GET {{base_url}}/health
Authorization: InvalidFormat
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"
jsonpath "$.message" == "Missing or invalid Authorization header"

# -----------------------------------------------------------------------------
# Test: Wrong API key returns 403 Forbidden
# -----------------------------------------------------------------------------
GET {{base_url}}/health
Authorization: Bearer wrong-api-key
HTTP 403
[Asserts]
jsonpath "$.error" == "Forbidden"
jsonpath "$.message" == "Invalid API key"

# -----------------------------------------------------------------------------
# Test: Empty Bearer token returns 401 Unauthorized
# -----------------------------------------------------------------------------
GET {{base_url}}/health
Authorization: Bearer 
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"

# -----------------------------------------------------------------------------
# Test: Products endpoint requires authentication
# -----------------------------------------------------------------------------
GET {{base_url}}/api/products
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"

# -----------------------------------------------------------------------------
# Test: Listings endpoint requires authentication
# -----------------------------------------------------------------------------
GET {{base_url}}/api/listings
HTTP 401
[Asserts]
jsonpath "$.error" == "Unauthorized"