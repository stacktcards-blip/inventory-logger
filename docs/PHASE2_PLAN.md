# Phase 2: Slab Detail & Inline Edit – Plan

## Prerequisites

- Run `migrations/003_add_slabs_pk.sql` in Supabase before Phase 2 work.
- PK logic reference: `docs/SLABS_PK_LOGIC.md`

## Step 2.1: Detail panel / modal

| Task | Details |
|------|---------|
| **Trigger** | Row click in slabs table |
| **Content** | Full slab from `slabs_enriched` (includes `id`, raw card cost) |
| **Layout** | Modal or side panel with grouped sections |
| **Sections** | Card identity • Grading • Dates • Raw card link |

## Step 2.2: Editable fields

| Field | Editable |
|-------|----------|
| `cert` | Yes |
| `grade` | Yes |
| `note` | Yes |
| `acquired_date` | Yes |
| `listed_date` | Yes |
| `sold_date` | Yes |

## Step 2.3: Update logic

| Task | Details |
|------|---------|
| **Target** | `slabs` table |
| **Key** | `id` (UUID PK) – use for updates |
| **Query** | `supabase.from('slabs').update({...}).eq('id', id)` |
| **After** | Refetch slabs, close modal |

## Step 2.4: Raw card link

- Show `raw_purchase_date`, `raw_seller`, `raw_cost_aud` when `raw_card_id` is set.
- Use `slabs_enriched` for detail view.

## PK visibility

- `id` column is shown in SlabsTable during development (`SHOW_PK_FOR_DEV = true`).
- Set `SHOW_PK_FOR_DEV = false` in `SlabsTable.tsx` to hide after Phase 2.
