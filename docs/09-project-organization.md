# Project Organization

> cloudflare does not use "project" as the highes-level organizational entity. however cloudflare Workers & Pages have "Create Application". Should i:
> * create an `application` in this manner, the other services (workflows, browser rendering, D1) will use a prefix. all in my current main account/
> * create separate account for this project?

Good question. Here's the straightforward answer:

**Stay in your current account, use a single application with a naming prefix.**

Cloudflare's "application" in Workers & Pages is really just a Worker deployment — it's not a project container the way Vercel or Railway use the term. The actual organizational unit for a multi-service project like yours is a **`wrangler.toml`** file in your repo, combined with a **naming convention**.

Here's why a separate account isn't worth it:

A separate account means separate billing, separate D1 databases that can't be shared, separate Browser Rendering quotas, and you'd have to manage two sets of credentials. The free tier limits (100k requests/day, 10ms CPU, etc.) apply per account, so splitting actually hurts you. There's no isolation benefit for a project of this scale.

**What to do instead — prefix everything:**

Pick a short project prefix, e.g. `pricetracker` or `hargaku`, and apply it consistently:

| Resource | Name |
|---|---|
| Workers | `pricetracker-storefront`, `pricetracker-api`, `pricetracker-redirector` |
| Workflow | `pricetracker-daily-refresh` |
| D1 database | `pricetracker-db` |
| Durable Object | `pricetracker-browser-session` |

In `wrangler.toml`, all these are declared in **one file** (or a few files if you split Workers into separate deployments), all under your existing account. D1 bindings, Browser Rendering bindings, and Workflow bindings all reference by name — the prefix keeps them visually grouped in the dashboard.

**One wrangler.toml or multiple?**

For your architecture I'd recommend **one repo, multiple Workers deployed separately** via a monorepo pattern or individual `wrangler.toml` per Worker subdirectory. The storefront, redirector, and ingestion API are separate Workers but share the same D1 binding by database ID.

So the answer is: click "Create application," name your first Worker `pricetracker-storefront` (or whatever your storefront Worker is), and keep everything in `rohmanhakim.workers.dev` under your current account.