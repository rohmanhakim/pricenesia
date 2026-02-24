# Environment Strategy

This document outlines the environment management approach for Pricenesia.

---

## Current Phase: MVP

During the MVP phase, the project uses a **two-tier environment approach**:

| Environment | Purpose | When |
|-------------|---------|------|
| **Local** | Development and testing | Now |
| **Production** | Live system | Now |

---

## Local Development

- **Secrets**: `.dev.vars` file in each Worker directory (gitignored)
- **Database**: Local D1 via `wrangler dev --local` (stored in `.wrangler/state/`)
- **Config**: Non-sensitive settings in `wrangler.toml` `[vars]` section

See `docs/10-secret-management.md` for details on setting up `.dev.vars`.

---

## Production

- **Secrets**: Set via `wrangler secret put` (encrypted, never visible in dashboard)
- **Database**: Remote D1 database (`pricenesia-db`)
- **Config**: Same `wrangler.toml` `[vars]` section

### Safety Mechanisms

Even without staging, production has built-in safety:

1. **Instant Rollback** — `wrangler rollback` reverts to previous deployment immediately
2. **D1 Time Travel** — Point-in-time database recovery via `wrangler d1 time-travel`
3. **Low Initial Traffic** — MVP blast radius is minimal

---

## Staging: Deferred Until Needed

Staging environment is intentionally **not implemented** during MVP.

### Why Defer Staging?

1. **Solo Developer** — Staging is most valuable with multiple developers
2. **Curated Data** — No complex user-generated content or migrations
3. **Instant Rollback** — Cloudflare Workers provides quick recovery
4. **D1 Time Travel** — Database can be restored to any point
5. **Low Traffic** — Small blast radius at MVP launch

### When to Add Staging

Add a staging environment when **any** of these conditions are met:

- [ ] Multiple developers or collaborators deploying code
- [ ] Running paid ad campaigns (production stability is critical)
- [ ] Users rely on price alerts (reputation risk from bugs)
- [ ] Schema migrations on populated database need testing
- [ ] Affiliate link rotation needs pre-production validation

### How to Add Staging Later

Estimated effort: **1-2 hours**

1. Create staging D1 database:
   ```bash
   wrangler d1 create pricenesia-db-staging
   ```

2. Create staging `wrangler.toml` for each Worker:
   ```toml
   name = "pricenesia-api-staging"
   # ... other config with staging database binding
   ```

3. Duplicate secrets for staging:
   ```bash
   wrangler secret put ADMIN_API_KEY --config wrangler.staging.toml
   ```

4. Add deployment scripts to `package.json`:
   ```json
   {
     "scripts": {
       "deploy:staging": "wrangler deploy --config wrangler.staging.toml",
       "deploy:production": "wrangler deploy"
     }
   }
   ```

---

## Summary

| Phase | Environments |
|-------|--------------|
| MVP | Local → Production |
| Post-MVP (when needed) | Local → Staging → Production |

This approach prioritizes velocity during MVP while maintaining production safety through Cloudflare's built-in recovery mechanisms.