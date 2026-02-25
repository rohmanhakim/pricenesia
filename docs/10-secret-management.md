# Secret Management Guide

This guide covers how to securely manage secrets and environment variables across the Pricenesia project.

---

## Overview

Pricenesia uses Cloudflare Workers, which provides a secure secrets management system. This project requires the following secrets:

| Secret | Used By | Purpose |
|--------|---------|---------|
| `ADMIN_API_KEY` | ingestion-api | Authenticates requests from Curation Dashboard |
| `TELEGRAM_BOT_TOKEN` | health-monitor | Bot token for sending Telegram alerts |
| `TELEGRAM_CHAT_ID` | health-monitor | Chat ID where alerts are sent |

---

## Production Secrets

### Setting Secrets via Wrangler CLI

Use `wrangler secret put` to securely store secrets in Cloudflare's encrypted secret storage:

```bash
# Ingestion API
cd packages/ingestion-api
wrangler secret put ADMIN_API_KEY
# Enter the value when prompted

# Health Monitor
cd packages/health-monitor
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

### How It Works

- Secrets are encrypted at rest and in transit
- They're only accessible to the specific Worker they're bound to
- They're never visible in the Cloudflare dashboard
- They're injected at runtime as `env.SECRET_NAME`
- Values can be updated without redeploying the Worker

### Accessing Secrets in Code

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Access secret via env
    const apiKey = env.ADMIN_API_KEY
    
    if (!apiKey) {
      throw new Error('ADMIN_API_KEY not configured')
    }
    
    // Use the secret...
  }
}
```

### Updating Secrets

To rotate or update a secret:

```bash
wrangler secret put ADMIN_API_KEY
# Enter the new value when prompted
```

The new value takes effect immediately without requiring a redeployment.

### Listing Secrets

To see what secrets are configured for a Worker:

```bash
wrangler secret list
```

Note: This only lists secret names, not values.

---

## Development Secrets

### Using `.env`

For local development, create a `.env` file in each Worker directory:

```bash
# packages/ingestion-api/.env
ADMIN_API_KEY=dev-api-key-123

# packages/health-monitor/.env
TELEGRAM_BOT_TOKEN=your-dev-bot-token
TELEGRAM_CHAT_ID=your-dev-chat-id
```

Wrangler automatically loads `.env` when running `wrangler dev`.

### Template File

A `.env.example` file is provided at the project root. Copy it to each Worker directory:

```bash
cp .env.example packages/ingestion-api/.env
cp .env.example packages/health-monitor/.env
```

Then edit each file with the appropriate values for that Worker.

### Example: Ingestion API

```bash
# packages/ingestion-api/.env
ADMIN_API_KEY=dev-api-key-123
```

This file is automatically loaded by `wrangler dev` when running locally.

### Important: Never Commit `.env`

The `.env` file is listed in `.gitignore` to prevent accidental commits:

```gitignore
# Secret files
.env
```

---

## Non-Secret Configuration

### Using `wrangler.toml` Variables

For non-sensitive configuration, use the `[vars]` section in `wrangler.toml`:

```toml
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"
```

These values are:
- Visible in the dashboard
- Included in deployments
- Suitable for feature flags, environment names, etc.

### Accessing Variables in Code

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    console.log(`Running in ${env.ENVIRONMENT} mode`)
    // ...
  }
}
```

---

## Frontend Environment Variables

### Cloudflare Pages

For the Svelte SPAs (storefront, curation-dashboard), set environment variables in the Cloudflare Pages dashboard:

1. Go to your Pages project
2. Settings → Environment variables
3. Add variables (they'll be bundled at build time)

### Naming Convention

Prefix public variables with `PUBLIC_` to indicate they're safe for client-side exposure:

```bash
PUBLIC_API_URL=https://api.pricenesia.com
PUBLIC_REDIRECTOR_URL=https://go.pricenesia.com
```

### In SvelteKit

Access these via the `$env` module:

```ts
import { PUBLIC_API_URL } from '$env/static/public'
```

---

## Security Best Practices

### Do ✅

- Use `wrangler secret put` for all production secrets
- Use `.env` for local development (gitignored)
- Rotate secrets periodically
- Use different secrets for dev and production
- Audit who has access to your Cloudflare account

### Don't ❌

- Never commit `.env` or any secret files to git
- Never hardcode secrets in source code
- Never log secrets (`console.log(env.ADMIN_API_KEY)`)
- Never share secrets via chat or email
- Never use the same secret across multiple environments

---

## Secret Rotation

When you need to rotate secrets (e.g., compromised or scheduled rotation):

1. Generate a new secret value
2. Update the secret:
   ```bash
   wrangler secret put ADMIN_API_KEY
   ```
3. Verify the Worker still functions
4. If using the secret elsewhere (e.g., Curation Dashboard), update those references

---

## Troubleshooting

### Secret Not Found

If you see `undefined` or errors accessing a secret:

1. Verify the secret is set:
   ```bash
   wrangler secret list
   ```
2. Check the binding name matches your code
3. For local dev, ensure `.env` exists in the Worker directory

### `.env` Not Loading

- Ensure the file is named exactly `.env` (not `.env.local`)
- Ensure it's in the same directory as `wrangler.toml`
- Run `wrangler dev` from the Worker directory

### Permission Denied

If you get permission errors when setting secrets:

- Ensure you're logged in: `wrangler login`
- Ensure you have access to the Cloudflare account
- Check the account ID in `wrangler.toml`

---

## Quick Reference

| Environment | File/Method | Git Tracked? |
|-------------|-------------|--------------|
| Production secrets | `wrangler secret put` | No |
| Development secrets | `.env` | No (gitignored) |
| Non-secret config | `wrangler.toml` `[vars]` | Yes |
| Frontend public vars | Cloudflare Pages dashboard | N/A |

---

## Checklist for New Team Members

- [ ] Copy `.env.example` to each Worker directory as `.env`
- [ ] Fill in development secret values
- [ ] Verify `wrangler dev` works locally
- [ ] Request access to Cloudflare account for production secrets
- [ ] Read this guide thoroughly