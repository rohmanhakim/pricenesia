# Personalized Alerts

The app can serve general users but each user can curate their own categories

## What This Means Conceptually

Instead of the catalog being purely the admin's editorial curation, users can follow specific categories or products and get personalized alerts. The scraping infrastructure stays identical — the admin still curate the product catalog. What changes is the **alert targeting layer** on top.

This is how most successful deal platforms work at scale — editorial curation of supply, user personalization of demand.

## What Needs to Change in the Schema

The existing schema needs a user layer added on top:

```sql
-- User identity (Telegram-first makes sense here)
CREATE TABLE users (
  id            TEXT PRIMARY KEY,  -- UUID
  telegram_id   TEXT UNIQUE,       -- Telegram chat ID
  created_at    TEXT DEFAULT (datetime('now')),
  is_active     INTEGER DEFAULT 1
);

-- What each user wants to follow
CREATE TABLE user_subscriptions (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT REFERENCES users(id),
  subscription_type    TEXT NOT NULL,  -- 'category' | 'product' | 'platform'
  subscription_value   TEXT NOT NULL,  -- e.g. 'beauty', 'sony-ps4-slim-1tb', 'shopee'
  alert_threshold_pct  INTEGER DEFAULT 15,  -- user-defined sensitivity
  created_at           TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_subs_user ON user_subscriptions(user_id);
CREATE INDEX idx_subs_value ON user_subscriptions(subscription_value);
```

This is intentionally lightweight. We're not building user accounts with passwords — Telegram ID is sufficient as identity since alerts are Telegram-first anyway.

## What Changes in the Alert Logic

The current price alert worker broadcasts to everyone. We'd replace that with a targeted fanout:

```ts
async function runPersonalizedAlerts(env: Env) {
  // Same drop detection query as before
  const drops = await detectPriceDrops(env.DB)
  
  if (drops.length === 0) return

  for (const drop of drops) {
    // Find all users subscribed to this product or its category
    const subscribers = await env.DB.prepare(`
      SELECT DISTINCT u.telegram_id, us.alert_threshold_pct
      FROM users u
      JOIN user_subscriptions us ON us.user_id = u.id
      WHERE u.is_active = 1
        AND (
          (us.subscription_type = 'product'  AND us.subscription_value = ?)
          OR (us.subscription_type = 'category' AND us.subscription_value = ?)
          OR (us.subscription_type = 'platform' AND us.subscription_value = ?)
        )
    `).bind(
      drop.canonical_product_id,
      drop.category,
      drop.platform
    ).all()

    for (const sub of subscribers.results as any[]) {
      // Respect per-user threshold
      if (drop.drop_pct < sub.alert_threshold_pct) continue
      
      await sendPersonalizedAlert(sub.telegram_id, drop, env)
    }
  }
}
```

## The Telegram Bot UX

Users manage their subscriptions through a simple bot interface — no web UI needed initially:

```
/start          → welcome, explain what the bot does
/follow beauty  → subscribe to beauty category
/follow pc-parts → subscribe to PC parts
/follow sony-ps4-slim-1tb → subscribe to specific product
/unfollow beauty
/list           → show current subscriptions
/threshold 20   → only alert me on 20%+ drops
```

This is low-friction enough that most users will set it up in under a minute. The bot handles subscription writes directly to D1.

## What Stays Exactly the Same

This is the nice part — our core pipeline is untouched:

- Scraping workflow runs identically
- Price snapshot storage is identical  
- Sanity checks are identical
- Referral redirector is identical
- The storefront still shows everything by default

The personalization is purely a **read/filter layer** on top of data that's already being collected.

## The Storefront Angle

On the web storefront side, "user curation" can be much simpler than full accounts — just URL-based filtering:

```
jejakharga.com/category/beauty
jejakharga.com/category/pc-parts
jejakharga.com/platform/shopee
```

These are just filtered views of the same data. No login required, and users can bookmark their preferred filtered view. This keeps the storefront stateless and simple while still feeling personalized.

If we want to go further, a lightweight "watchlist" stored in localStorage works for web users without any backend changes — the user pins products client-side and the page just filters the data it already fetched.

## The One Real Complexity This Adds

**Alert fanout at scale.** Sending one Telegram message is trivial. Sending 5,000 personalized messages when a popular product drops requires either batching carefully or using Telegram's broadcast limits thoughtfully (30 messages/second to individual chats). At early scale this isn't a problem, but it's worth knowing Cloudflare Workers has a 1,000 subrequest limit per invocation — so the fanout logic needs to be queued via a Durable Object or broken into batches via multiple Worker invocations if our subscriber count grows significantly.

For now though, under a few thousand users, the simple loop above works fine and we can optimize it when the problem actually arrives.