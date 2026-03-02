# Slabs Primary Key Logic

## Overview

The `slabs` table uses a surrogate primary key `id` (UUID) to uniquely identify each slab record.

## Key Relationships

| Column | Purpose |
|--------|---------|
| `id` | **Primary key** – Surrogate UUID, stable identifier for each slab. Use for updates, deletes, and foreign key references. |
| `sku` | **Business key** – Human-readable identifier (e.g. PSA cert format). Display and search only; not used for linking. |
| `raw_card_id` | **FK to raw_cards** – Links slab to the ungraded card purchase record. `raw_cards.id` is the target. Use this for the raw_cards ↔ slabs relationship. |

## PK Logic for Future Records

1. **Always use `id`** for programmatic operations (update, delete, link from other tables).
2. **Use `sku`** for display and search only.
3. **Use `raw_card_id`** when linking slabs to raw card purchases (one slab → one raw_card). SKU was used for a one-time backfill; see `docs/RAW_CARDS_SLABS_LINKING.md`.

## Migrations

- `migrations/003_add_slabs_pk.sql` – Add slabs `id` PK.
- `migrations/004_link_slabs_to_raw_cards_by_sku.sql` – One-time link by SKU match; after this, use `raw_card_id` only.

## Views

`slabs_dashboard` and `slabs_enriched` both include `id` for use in the frontend. Updates target `slabs` via `id`.
