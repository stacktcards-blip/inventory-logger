# raw_cards ↔ slabs Linking

## PK/FK System

| Table      | PK   | FK / Link column      |
|-----------|------|------------------------|
| raw_cards | `id` (bigint) | — |
| slabs     | `id` (uuid)   | `raw_card_id` → raw_cards.id |

The slabs table references raw_cards via `raw_card_id`. This is the canonical link; use it for all programmatic operations.

## SKU Role

- **raw_cards.SKU** – Business identifier for the raw card (uppercase column).
- **slabs.sku** – Business identifier for the slab (e.g. PSA cert format).

SKU was used for a **one-time backfill** to populate `slabs.raw_card_id` where `slabs.sku` matched `raw_cards."SKU"`. After that migration, **SKU is not used for linking**; it is for display and search only.

## Migration

See `migrations/004_link_slabs_to_raw_cards_by_sku.sql`. Run once to link existing slabs to raw_cards by SKU match.

## Future Records

When creating new slabs from raw cards:

1. Set `slabs.raw_card_id = raw_cards.id` (use the FK).
2. Set `slabs.sku` from your business logic (e.g. cert number) for display.
3. Do not use SKU for joins or updates.
