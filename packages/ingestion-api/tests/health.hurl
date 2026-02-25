# =============================================================================
# Health Endpoint Tests
# =============================================================================
# Tests the health check endpoint which returns service status.

# -----------------------------------------------------------------------------
# Test: Health check returns 200 with status "ok"
# -----------------------------------------------------------------------------
GET {{base_url}}/health
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.status" == "ok"
jsonpath "$.timestamp" exists
jsonpath "$.environment" exists