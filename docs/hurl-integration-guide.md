# Hurl Integration Guide for API Testing

This guide documents how Hurl is integrated into the Pricenesia project for testing the Ingestion API. Use this as a reference when integrating Hurl into other APIs within the project.

---

## Table of Contents

1. [Why Hurl?](#why-hurl)
2. [Installation](#installation)
3. [Project Structure](#project-structure)
4. [Writing Tests](#writing-tests)
5. [Running Tests Locally](#running-tests-locally)
6. [CI Integration](#ci-integration)
7. [Platform Portability](#platform-portability)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Why Hurl?

Hurl is a command-line tool for running HTTP requests defined in plain text files. It's ideal for API testing because:

| Feature | Hurl | Postman | Jest + supertest |
|---------|------|---------|------------------|
| Plain text format | ✅ | ❌ | ✅ |
| Version controllable | ✅ | ❌ (collections) | ✅ |
| CI-friendly | ✅ | ❌ (requires Newman) | ✅ |
| Language agnostic | ✅ | ✅ | ❌ (Node.js only) |
| Fast execution | ✅ | ❌ | ✅ |
| Captures for chaining | ✅ | ✅ | ✅ |
| Assertions | ✅ (jsonpath, regex, XPath) | ✅ | ✅ (code) |
| Low learning curve | ✅ | ❌ | ❌ |

**Key Advantages:**

- **Declarative syntax**: Tests read like HTTP requests with assertions
- **Chaining**: Capture values from responses and use in subsequent requests
- **Platform agnostic**: Works with any HTTP server (Cloudflare, Vercel, Docker, etc.)
- **Fast CI**: No browser overhead, pure HTTP testing

---

## Installation

### Local Development

**macOS:**
```bash
brew install hurl
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get update
sudo apt-get install hurl
```

**Linux (Arch):**
```bash
sudo pacman -S hurl
```

**Windows:**
```bash
winget install hurl
```

**Verify installation:**
```bash
hurl --version
```

### CI (GitHub Actions)

Add this step to your workflow:

```yaml
- name: Install Hurl
  run: |
    sudo apt-get update
    sudo apt-get install -y hurl
```

---

## Project Structure

```
packages/ingestion-api/
├── tests/
│   ├── hurl.toml           # Hurl configuration
│   ├── ci-variables.toml   # CI-specific variables
│   ├── health.hurl         # Health endpoint tests
│   ├── auth.hurl           # Authentication tests
│   ├── products.hurl       # Products CRUD tests
│   └── listings.hurl       # Listings CRUD tests
├── package.json            # Contains test scripts
└── .env                    # Local environment variables
```

### File Purposes

| File | Purpose |
|------|---------|
| `hurl.toml` | Global config: timeouts, retries, default headers |
| `.env` | Local development variables (wrangler + Hurl) |
| `.env.ci` | CI-specific variables for GitHub Actions |
| `*.hurl` | Test files organized by API domain |

---

## Writing Tests

### Basic Structure

A Hurl file contains one or more HTTP requests:

```hurl
# Comments start with #
GET {{base_url}}/health
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.status" == "ok"
```

### Variables

Variables are defined in several ways:

**1. CLI arguments:**
```bash
hurl --variable base_url=http://localhost:8787 --variable api_key=secret tests/
```

**2. Environment file (`.env`):**
```bash
# .env format (key=value, no quotes)
base_url=http://localhost:8787
api_key=dev-api-key-123
```

```bash
hurl --test --variables-file .env tests/
```

**Note:** Hurl expects simple `key=value` format without quotes, not TOML format.

**3. Captures from responses:**
```hurl
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "test-product",
  "name": "Test"
}
HTTP 201
[Captures]
product_id: jsonpath "$.id"
```

The `product_id` variable can now be used in subsequent requests:

```hurl
GET {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
HTTP 200
```

### Assertions

**Status code:**
```hurl
HTTP 201
HTTP 404
HTTP 204
```

**JSON body with jsonpath:**
```hurl
[Asserts]
jsonpath "$.id" == "test-product"
jsonpath "$.name" == "Test"
jsonpath "$.price" > 0
jsonpath "$.tags" count == 3
jsonpath "$.active" is true
```

**Header assertions:**
```hurl
[Asserts]
header "Content-Type" contains "application/json"
```

**Body contains:**
```hurl
[Asserts]
body contains "error"
```

### Request Body

**JSON:**
```hurl
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "test-product",
  "name": "Test Product",
  "category": "Electronics"
}
HTTP 201
```

**Using multiline strings:**
```hurl
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
```
{
  "id": "test-product",
  "name": "Test Product"
}
```
HTTP 201
```

### Chaining Requests

Hurl executes requests sequentially. Use captures to chain dependent requests:

```hurl
# 1. Create a product
POST {{base_url}}/api/products
Authorization: Bearer {{api_key}}
{
  "id": "test-product",
  "name": "Test Product"
}
HTTP 201
[Captures]
product_id: jsonpath "$.id"

# 2. Create a listing for that product
POST {{base_url}}/api/listings
Authorization: Bearer {{api_key}}
{
  "canonical_product_id": "{{product_id}}",
  "platform": "tokopedia",
  "seller_name": "Test Seller",
  "raw_url": "https://tokopedia.com/test"
}
HTTP 201
[Captures]
listing_id: jsonpath "$.id"

# 3. Update the listing
PATCH {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
{
  "seller_name": "Updated Seller"
}
HTTP 200

# 4. Delete both
DELETE {{base_url}}/api/listings/{{listing_id}}
Authorization: Bearer {{api_key}}
HTTP 204

DELETE {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
HTTP 204
```

---

## Running Tests Locally

### Prerequisites

1. **Start the development server:**
   ```bash
   pnpm --filter @pricenesia/ingestion-api dev
   ```

2. **Verify the server is running:**
   ```bash
   curl http://localhost:8787/health -H "Authorization: Bearer dev-api-key-123"
   ```

### Run Tests

**Using pnpm (deterministic - resets database first):**
```bash
pnpm --filter @pricenesia/ingestion-api test:clean
```

This is the recommended command for local development and AI agents, as it ensures a clean database state before running tests.

**Using pnpm (without database reset):**
```bash
pnpm --filter @pricenesia/ingestion-api test
```

**Direct hurl command:**
```bash
cd packages/ingestion-api
hurl --test --variable base_url=http://localhost:8787 --variable api_key=dev-api-key-123 tests/
```

**Run a single test file:**
```bash
hurl --test --variable base_url=http://localhost:8787 --variable api_key=dev-api-key-123 tests/health.hurl
```

**Run with verbose output:**
```bash
hurl --test --verbose --variable base_url=http://localhost:8787 --variable api_key=dev-api-key-123 tests/
```

### Expected Output

```
❯ hurl --test tests/health.hurl tests/auth.hurl tests/products.hurl tests/listings.hurl
tests/health.hurl: Success (4 request(s) in 25 ms)
tests/auth.hurl: Success (6 request(s) in 38 ms)
tests/products.hurl: Success (28 request(s) in 187 ms)
tests/listings.hurl: Success (35 request(s) in 212 ms)
--------------------------------------------------------------------------------
Executed files:  4
Succeeded files: 4
Failed files:    0
Duration:        462 ms
```

---

## CI Integration

### GitHub Actions Workflow

The test job in `.github/workflows/deploy-ingestion-api.yml`:

```yaml
test:
  needs: build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v3
      with:
        version: 9

    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'

    - name: Install Hurl
      run: |
        sudo apt-get update
        sudo apt-get install -y hurl

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Build shared package
      run: pnpm --filter @pricenesia/shared build

    - name: Start Worker in background
      run: |
        pnpm --filter @pricenesia/ingestion-api dev &
        echo "Waiting for Worker to be ready..."
        for i in {1..30}; do
          if curl -s http://localhost:8787/health -H "Authorization: Bearer ${{ secrets.ADMIN_API_KEY }}" | grep -q '"status":"ok"'; then
            echo "Worker is ready!"
            break
          fi
          echo "Waiting... ($i/30)"
          sleep 1
        done
      env:
        ADMIN_API_KEY: ${{ secrets.ADMIN_API_KEY }}

    - name: Run Hurl tests
      run: pnpm --filter @pricenesia/ingestion-api test:ci
      env:
        api_key: ${{ secrets.ADMIN_API_KEY }}
```

### Key Points

1. **Test job runs after build** - Ensures TypeScript compiles before testing
2. **Worker starts in background** - Uses `&` to run dev server asynchronously
3. **Health check polling** - Waits for the server to be ready before running tests
4. **Deployment requires tests** - `deploy-preview` and `deploy-production` have `needs: [build, test]`

### Ephemeral Database

When `wrangler dev` runs in CI, it creates an ephemeral local D1 database (SQLite). This means:

- Each CI run starts with a fresh database
- No cleanup needed between test runs
- Tests are isolated from production data
- No separate test database setup required

---

## Platform Portability

Hurl tests are platform-agnostic. The only platform-specific part is how you start the server.

### Adapting for Other Platforms

| Platform | Start Server Command |
|----------|---------------------|
| **Cloudflare Workers** | `wrangler dev` |
| **Vercel** | `vercel dev` |
| **Docker** | `docker run -p 3000:3000 my-image` |
| **Node.js/Express** | `npm start` or `node server.js` |
| **Serverless Framework** | `serverless offline` |

### Example: Vercel Integration

```yaml
- name: Start Vercel dev server
  run: |
    pnpm dev &
    for i in {1..30}; do
      if curl -s http://localhost:3000/api/health | grep -q 'ok'; then
        break
      fi
      sleep 1
    done

- name: Run Hurl tests
  run: hurl --test --variable base_url=http://localhost:3000 tests/
```

### Example: Docker Integration

```yaml
- name: Start Docker container
  run: |
    docker run -d -p 3000:3000 --name test-api my-image:latest
    for i in {1..30}; do
      if curl -s http://localhost:3000/health | grep -q 'ok'; then
        break
      fi
      sleep 1
    done

- name: Run Hurl tests
  run: hurl --test --variable base_url=http://localhost:3000 tests/

- name: Cleanup
  run: docker stop test-api && docker rm test-api
```

---

## Best Practices

### 1. Organize Tests by Domain

Create separate files for each API domain:

```
tests/
├── auth.hurl      # Authentication endpoints
├── users.hurl     # User CRUD
├── products.hurl  # Product CRUD
└── orders.hurl    # Order workflows
```

### 2. Use Descriptive Comments

```hurl
# -----------------------------------------------------------------------------
# Test: Create product with duplicate ID returns 409 Conflict
# -----------------------------------------------------------------------------
POST {{base_url}}/api/products
```

### 3. Clean Up Test Data

Even with an ephemeral database, clean up within tests for idempotency:

```hurl
# Cleanup: Delete test product
DELETE {{base_url}}/api/products/{{product_id}}
Authorization: Bearer {{api_key}}
HTTP 204
```

### 4. Test All HTTP Status Codes

Include tests for:
- ✅ Success (200, 201, 204)
- ❌ Client errors (400, 401, 403, 404, 409)
- ⚠️ Server errors (500) if applicable

### 5. Use Captures for Dependencies

```hurl
POST {{base_url}}/api/products
# ...
[Captures]
product_id: jsonpath "$.id"
```

### 6. Keep Tests Independent

Each test file should be self-contained. Don't rely on data from other test files.

### 7. Test Realistic Data

Use realistic values in tests:

```hurl
{
  "id": "sony-ps5-digital-edition",
  "name": "PlayStation 5 Digital Edition",
  "category": "Gaming"
}
```

### 8. Separate CI Variables

Keep `ci-variables.toml` separate from local dev variables:

```
tests/
├── hurl.toml             # Config (checked in)
├── ci-variables.toml     # CI variables (checked in)
└── local-variables.toml  # Local overrides (gitignored)
```

---

## Troubleshooting

### "Connection refused" Error

**Problem:** Tests fail because the server isn't running.

**Solution:** Ensure the dev server is running before executing tests:

```bash
# Terminal 1
pnpm --filter @pricenesia/ingestion-api dev

# Terminal 2
pnpm --filter @pricenesia/ingestion-api test
```

### Tests Pass Locally but Fail in CI

**Problem:** CI tests fail despite passing locally.

**Possible causes:**

1. **Server not ready:** The health check timeout is too short. Increase the wait loop.
2. **Different API key:** Ensure CI uses the same key as the environment variable.
3. **Database state:** CI starts fresh; ensure tests don't assume pre-existing data.

### JSON Path Assertion Fails

**Problem:** `jsonpath "$.field" == "value"` fails unexpectedly.

**Solution:** Use `--verbose` to see the actual response:

```bash
hurl --test --verbose tests/products.hurl
```

Check for:
- Field name casing (`name` vs `Name`)
- Nested objects (`$.data.id`)
- Array indices (`$.items[0].id`)

### Variable Not Substituted

**Problem:** `{{variable}}` appears literally in the request.

**Solution:** Ensure the variable is defined:

1. Check `ci-variables.toml` has the variable
2. Check CLI: `--variable name=value`
3. Check capture: `name: jsonpath "$.id"`

### Capture Returns Wrong Value

**Problem:** Captured value is null or incorrect.

**Solution:** Verify the JSONPath expression:

```bash
curl -s http://localhost:8787/api/products/test | jq '.id'
```

---

## Quick Reference

### Hurl CLI Options

| Option | Description |
|--------|-------------|
| `--test` | Run in test mode (reports results) |
| `--variable name=value` | Set a variable |
| `--variables-file path` | Load variables from file |
| `--verbose` | Show request/response details |
| `--color` | Colored output |
| `--report-html path` | Generate HTML report |

### Common JSONPath Examples

```hurl
jsonpath "$.id"              # Root field
jsonpath "$.data.name"       # Nested field
jsonpath "$.items[0].id"     # Array index
jsonpath "$.items" count     # Array length
jsonpath "$.price" > 1000    # Numeric comparison
jsonpath "$.active" is true  # Boolean check
```

### Common Assertions

```hurl
HTTP 200                           # Status code
jsonpath "$.id" == "test"          # String equality
jsonpath "$.count" >= 1            # Numeric comparison
jsonpath "$.tags" count == 3       # Array length
jsonpath "$.active" is true        # Boolean
jsonpath "$.email" regex ".*@.*"   # Regex match
header "Content-Type" contains "application/json"
body contains "success"
```

---

## Resources

- [Hurl Documentation](https://hurl.dev/docs/manual.html)
- [Hurl Tutorial](https://hurl.dev/docs/tutorial/your-first-hurl-file.html)
- [JSONPath Reference](https://goessner.net/articles/JsonPath/)
- [GitHub Actions: install-hurl](https://github.com/marketplace/actions/install-hurl-cross-platform)