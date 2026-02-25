# Product-Listing Relationship

## Overview

This document explains the relationship between `canonical_products` and `platform_listings`, with a focus on soft-delete semantics and data integrity implications.

---

## Entity Relationship

```
┌─────────────────────────┐       ┌─────────────────────────┐
│   canonical_products    │       │    platform_listings    │
├─────────────────────────┤       ├─────────────────────────┤
│ id (PK)                 │◄──────│ canonical_product_id(FK)│
│ name                    │   1:N │ id (PK)                 │
│ category                │       │ platform                │
│ model_number            │       │ seller_name             │
│ image_url               │       │ raw_url                 │
│ is_active               │       │ is_active               │
│ created_at              │       │ is_pinned_seller        │
└─────────────────────────┘       │ last_scraped_at         │
                                  └─────────────────────────┘
                                            │
                                            │ 1:N
                                            ▼
                                  ┌─────────────────────────┐
                                  │    price_snapshots      │
                                  ├─────────────────────────┤
                                  │ id (PK)                 │
                                  │ listing_id (FK)         │
                                  │ price                   │
                                  │ scraped_at              │
                                  └─────────────────────────┘
```

**Key Points:**
- One canonical product can have multiple platform listings (1:N relationship)
- Each listing belongs to exactly one canonical product
- Historical price snapshots are tied to listings, not products directly
- The `condition` field (`new` | `used`) distinguishes item condition, useful for filtering used items

---

## Soft-Delete Semantics

### What is Soft Delete?

Soft delete means setting an `is_active = 0` flag instead of removing the row from the database. This preserves:

1. **Historical data integrity** — Price snapshots remain linked to valid listings
2. **Audit trail** — You can see which products were tracked
3. **Reversibility** — Accidental deletions can be undone

### Product Soft-Delete Behavior

When you delete a product via `DELETE /api/products/:id`:

```sql
UPDATE canonical_products SET is_active = 0 WHERE id = ?
```

**What happens:**
- ✅ Product's `is_active` is set to `0`
- ❌ Listings are **NOT** modified (their `is_active` remains unchanged)
- ❌ Price snapshots are **NOT** affected

**Why independent soft-delete?**
- Keeps the delete operation simple and fast
- Allows product reactivation with all listings intact
- Queries already filter via JOIN, so inactive products automatically hide their listings

### Listing Soft-Delete Behavior

When you delete a listing (future implementation):

```sql
UPDATE platform_listings SET is_active = 0 WHERE id = ?
```

**What happens:**
- ✅ Listing's `is_active` is set to `0`
- ❌ Product is **NOT** affected
- ❌ Price snapshots are **NOT** affected

---

## Query Patterns

### Active Products with Active Listings

```sql
SELECT 
  cp.name,
  pl.platform,
  pl.seller_name
FROM canonical_products cp
JOIN platform_listings pl ON pl.canonical_product_id = cp.id
WHERE cp.is_active = 1
  AND pl.is_active = 1
```

This query automatically filters out:
- Products that have been soft-deleted
- Listings that have been soft-deleted
- Listings belonging to soft-deleted products

### Reactivating a Soft-Deleted Product

```http
PATCH /api/products/:id
Content-Type: application/json

{
  "is_active": true
}
```

The product becomes visible again, along with all its listings (assuming they weren't independently deleted).

---

## Data Integrity Considerations

### Why Not Hard Delete?

Hard delete would cause:

1. **Orphaned price snapshots** — Historical price data would reference non-existent listings
2. **Broken redirect links** — Short URLs stored in `redirect_links` would point to nothing
3. **Lost analytics** — Click counts and scraping history would be disconnected

### Why Not Cascade Soft-Delete?

Cascade soft-delete (automatically setting `is_active = 0` on listings when product is deleted) would:

1. **Complicate reactivation** — You'd need to remember which listings were active before
2. **Mix concerns** — A listing might be intentionally inactive for other reasons
3. **Add complexity** — The delete operation becomes multi-step and error-prone

### Recommended Approach: Independent Soft-Delete

| Operation | Product `is_active` | Listing `is_active` | Result |
|-----------|---------------------|---------------------|--------|
| Delete product | `0` | Unchanged | Product hidden, listings preserved |
| Delete listing | Unchanged | `0` | Listing hidden, product visible |
| Reactivate product | `1` | Unchanged | All previous listings visible again |

---

## API Endpoints Summary

| Endpoint | Action | Side Effects |
|----------|--------|--------------|
| `DELETE /api/products/:id` | Sets `is_active = 0` on product | None (listings unchanged) |
| `PATCH /api/products/:id` | Can set `is_active = true` to reactivate | None |
| `DELETE /api/listings/:id` | Sets `is_active = 0` on listing | None (product unchanged) |

---

## Future Considerations

### When to Consider Hard Delete

Hard delete may be appropriate for:

1. **GDPR/privacy compliance** — If a user requests data deletion
2. **Storage optimization** — After a long retention period (e.g., 2+ years)
3. **Manual cleanup** — Administrative purge of test/duplicate data

For now, soft-delete is the default and recommended approach.

### Potential Enhancements

1. **Deleted-at timestamp** — Add `deleted_at` column for audit trail
2. **Deletion reason** — Track why something was deleted
3. **Bulk operations** — Delete multiple products/listings at once
4. **Cascade option** — Allow explicit cascade delete via query parameter

---

## Summary

| Aspect | Behavior |
|--------|----------|
| Delete method | Soft delete (`is_active = 0`) |
| Product → Listing cascade | No cascade, independent |
| Historical data | Preserved |
| Reactivation | Supported via PATCH |
| Query filtering | JOIN on `is_active = 1` for both tables |