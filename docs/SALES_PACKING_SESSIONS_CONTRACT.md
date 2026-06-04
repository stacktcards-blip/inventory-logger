# Sales Packing Sessions MVP contract

Status: implementation plan / contract, based on repo inspection in worktree `feat/sales-packing-sessions`.

## Scope boundary

Sales Packing imports eBay order/export data as listing-level packing context only. It must not decide or write the exact slab/cert sold. Exact physical slab assignment happens during packing when the operator scans the slab cert into a packing row.

MVP includes:

- saved/reopenable CSV packing sessions;
- raw CSV audit storage;
- one parsed item row per eBay item line;
- one packing row per physical quantity unit;
- persisted cert scans, removed rows, scan statuses, and warnings;
- read-only warnings for duplicate scans and slab availability when reliable local data exists.

MVP excludes:

- eBay API auto-import/OAuth;
- writing to `ebay_sales`;
- marking `slabs` as sold;
- linking scanned certs to final sale records;
- relying on CSV/listing/SKU/title as exact cert identity.

Those writebacks should wait for a backend/RPC transaction after cert validation and inventory reconciliation are reliable.

## Relevant implementation found

Current route/UI:

- `frontend/src/App.tsx` registers route `sales-packing` -> `SalesPackingPage`.
- `frontend/src/components/AppLayout.tsx` adds the `Sales Packing` nav link.
- `frontend/src/pages/SalesPackingPage.tsx` handles CSV paste/upload, saved session list/load/delete, cert input persistence, row removal, export, and read-only cert validation via Supabase.

Current parser/helpers:

- `frontend/src/lib/ebaySalesParser.ts`
  - Parses eBay Paid & Posted CSV.
  - Skips blank/footer rows.
  - Skips combined-order parent rows and inherits context into child item rows.
  - Expands `quantity > 1` into multiple packing rows.
  - Sorts rows by `salesRecordNumber` numeric-aware, then order number, then item number.
  - Exports current visible rows to CSV.
- `frontend/src/lib/salesPackingPersistence.ts`
  - Builds table-specific insert payloads.
  - Stores `raw_item_json` on `sales_packing_item_rows` only, not packing rows.
  - Maps saved `sales_packing_rows` back into visible UI rows and re-sorts numeric-aware.
- `frontend/src/lib/salesPackingScan.ts`
  - Defines scanner Enter -> next visible cert input behavior.
- `frontend/src/lib/salesPackingCertValidation.ts`
  - Normalizes certs.
  - Flags duplicate certs within the active session.
  - Looks up scanned certs against `slabs_dashboard` read-only.
  - Flags not found, duplicate DB cert rows, sold/not-available rows, and metadata review rows.

Current tests:

- `frontend/tests/ebaySalesParser.check.ts`
  - Parser row counts, warning generation, numeric sales-record sorting, blank cert fields, next-input focus helper, CSV export, removed-row summary/export behavior, persistence payload shape, saved-row reload mapping, saved-row sorting.

Current related schema/migrations:

- `migrations/023_sales_packing_saved_imports.sql` defines the three requested saved-session tables:
  - `sales_packing_imports`
  - `sales_packing_item_rows`
  - `sales_packing_rows`
- `migrations/010_ebay_sales_tables.sql` defines future `ebay_sales`/matching tables, but these are not part of the MVP write path.
- `migrations/011_slabs_sale_fields.sql` adds sale fields on `slabs`; do not update them in this MVP.
- `migrations/026_slab_lifecycle_and_psa_master_parse_status.sql` recreates `slabs_dashboard` with `cert`, `sales_status`, `listing_state`, `sold_date`, and metadata fields used for read-only cert validation.

Docs found:

- `docs/CURRENT_ROADMAP.md` already describes saved sessions and defers eBay API/writeback. Note: line 45 says rows sort by order number, but current parser/tests sort by Sales Record Number. Update that line when touching roadmap docs.
- `docs/ACTIVE_INVENTORY_APP_MAP.md` references the Sales Packing MVP at a high level.

## Table existence / migration status

Repo-level confirmation: the requested tables exist in `migrations/023_sales_packing_saved_imports.sql` and current frontend code queries/inserts those exact table names.

Live Supabase confirmation was not run from this worktree because no Supabase/Postgres credentials are present in the worker environment (`SUPABASE_*`, `DATABASE_URL`, `PG*` env vars absent; only `.env.example` files found). Before deploying or relying on production, manually verify in Supabase SQL:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'sales_packing_imports',
    'sales_packing_item_rows',
    'sales_packing_rows'
  )
order by table_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'sales_packing_imports',
    'sales_packing_item_rows',
    'sales_packing_rows'
  )
order by table_name, ordinal_position;
```

Expected result: all three tables exist with the columns in `migrations/023_sales_packing_saved_imports.sql`. If any are missing, apply migration 023 before enabling saved sessions in production.

## Strict MVP data contract

### `sales_packing_imports`

One row per uploaded/pasted CSV packing session.

Required fields:

- `id`: UUID session id.
- `uploaded_at`: session creation timestamp.
- `uploaded_by`: authenticated user id when available.
- `source_filename`: uploaded filename or null for pasted CSV.
- `raw_csv_text`: exact pasted/uploaded CSV text for audit/debug/reparse.
- `row_count`: count of parsed eBay item rows, not expanded packing rows.
- `expanded_row_count`: count of physical packing rows after quantity expansion and current visible rows at save time.
- `order_count`: distinct non-empty order numbers among saved packing rows.
- `total_sold_ex_postage`: sum of `sold_for` across saved packing rows.
- `status`: one of `imported`, `partially_scanned`, `scanned`, `cancelled`.
- `notes`: optional operator/internal notes.

Rules:

- Status `cancelled` hides/deletes a draft from normal UI but keeps audit rows.
- CSV import must not mark anything sold.
- If the migration is missing in production, the UI should degrade with a saved-session-unavailable message while preserving local parse/export.

### `sales_packing_item_rows`

One row per parsed eBay item line after cleaning, before quantity expansion.

Required fields:

- `import_id`: FK to `sales_packing_imports`.
- `line_item_key`: stable key for the eBay item line.
- `sale_date`, `buyer_username`, `order_number`, `sales_record_number`, `item_number`, `listing_title`, `custom_label`, `quantity`, `sold_for`, `postage_and_handling`, `total_price`, `tracking_number`, `combined_order`.
- `warnings`: JSON array of parser/listing-level warnings.
- `raw_item_json`: full normalized parser row for audit/reparse.

Rules:

- Exactly one item row per parsed eBay line item.
- Combined-order parent rows with no item/title are not item rows; their order/buyer/tracking context is inherited by child rows.
- Preserve item rows even when listing title/SKU is weak; warnings should carry uncertainty.
- Unique key should be `unique(import_id, line_item_key)`.

Stable `line_item_key` rule:

- Current code uses `orderNumber|salesRecordNumber|itemNumber`.
- Contract recommendation: keep this for current eBay CSVs, but harden to `order_number|sales_record_number|item_number|source_line_index` if eBay can produce duplicate item numbers under the same order/record. The key must be deterministic for the same CSV and must not include cert or mutable UI state.

### `sales_packing_rows`

One row per physical packing quantity unit. This is where cert scan state lives.

Required fields:

- `import_id`: FK to `sales_packing_imports`.
- `line_item_key`: points back to the item row key.
- Repeated item context fields needed for fast UI/export: sale date, buyer, order, sales record, item number, title, SKU, quantity, prices, tracking, combined flag, warnings.
- `quantity_unit`: `1 of 1`, `1 of 3`, `2 of 3`, etc.
- `cert_scanned`: raw/operator-entered cert after trim, null/blank if unscanned.
- `scan_status`: `pending`, `scanned`, future `validated`/`error`.
- `removed`: boolean, persists row hiding/exclusion from active packing/export.
- `removed_reason`: e.g. `removed_from_packing_view`.
- `validation_flags`: JSON warning/status array for durable validation state when implemented.
- `matched_at`: optional validation timestamp, not sale/writeback timestamp.

Rules:

- Exactly one packing row per physical quantity unit.
- Multi-quantity eBay item rows must expand; never collapse duplicate slabs into one cert input.
- Removed rows are hidden from the active packing view and current export but retained for audit.
- Cert scans and removals persist on save/reopen.
- `raw_item_json` must not be inserted into `sales_packing_rows`; it belongs only on item rows.

## API / data access contract

Current MVP uses browser Supabase access directly:

1. `select` recent active imports from `sales_packing_imports` where `status != 'cancelled'`, ordered by `uploaded_at desc`.
2. On save:
   - insert one `sales_packing_imports` row;
   - insert all `sales_packing_item_rows` with `import_id`;
   - insert all `sales_packing_rows` with `import_id`.
3. On reopen:
   - select rows from `sales_packing_rows` for the import id;
   - sort client-side with numeric Sales Record Number sort.
4. On cert scan update:
   - update only the packing row `cert_scanned`, `scan_status`, `updated_at`.
5. On row removal/restore:
   - update only `removed`, `removed_reason`, `updated_at` on packing rows.
6. On soft-delete saved import:
   - update `sales_packing_imports.status = 'cancelled'`.

Recommended next API hardening:

- Keep direct Supabase reads for lists/load if acceptable.
- Move multi-table save into a Supabase RPC or backend endpoint so import + item rows + packing rows are atomic. Current browser sequence can create partial saves if item/packing insert fails after import creation.
- Add a repair/rebuild helper that can regenerate packing rows from `raw_csv_text` for an import with missing packing rows.
- Add an index/constraint for stable packing row identity if updating by something other than UUID becomes necessary: `unique(import_id, line_item_key, quantity_unit)`.

## Duplicate / warning semantics

### Duplicate orders within a session

Definition: more than one parsed item row or packing row shares the same non-empty `order_number`.

Severity:

- Informational/warn, not blocking.
- Expected for combined orders or multi-item orders.
- Useful as visibility because the operator may need to pack multiple slabs for the same buyer/order.

Recommended UI:

- Show an order-level badge/count: `Order appears N times in this session`.
- Do not mark as error unless the same `line_item_key` appears twice, which suggests duplicate CSV import lines.

### Duplicate item lines within a session

Definition: same `line_item_key` appears more than once in `sales_packing_item_rows` for one import.

Severity:

- Error/warn before save.
- Database unique constraint should reject duplicates.

Recommended behavior:

- If duplicate `line_item_key` exists, include source row/index in warning and require operator review.
- Do not silently merge because quantities and order context could differ.

### Duplicate cert already scanned in this session

Definition: normalized cert appears in more than one non-removed packing row in the active session.

Severity:

- Blocking/danger warning in UI.
- Current helper already returns `duplicate_in_session` and message `Already scanned in this packing session`.

Recommended behavior:

- Normalize cert by stripping punctuation/spaces and uppercasing.
- Ignore blank certs and removed rows.
- Do not prevent typing, but highlight both/all duplicated rows and exclude from any future sold-writeback commit.

### Cert appearing in previous sessions

Definition: normalized cert appears on non-cancelled `sales_packing_rows` in a different import/session.

Severity:

- Warn if previous session is still `imported`/`partially_scanned`/`scanned`.
- Danger if previous session is later committed as sold in future writeback.
- For MVP, this is visibility only because sessions are drafts and may contain old mistakes.

Recommended query:

```sql
select r.import_id, i.uploaded_at, i.source_filename, i.status,
       r.id as row_id, r.order_number, r.sales_record_number, r.item_number,
       r.cert_scanned, r.scan_status, r.removed
from sales_packing_rows r
join sales_packing_imports i on i.id = r.import_id
where regexp_replace(upper(coalesce(r.cert_scanned, '')), '[^0-9A-Z]', '', 'g') = :normalized_cert
  and r.import_id <> :current_import_id
  and coalesce(r.removed, false) = false
  and i.status <> 'cancelled'
order by i.uploaded_at desc;
```

Implementation note: if previous-session checks become common, add a generated normalized cert column or store normalized cert separately; do not run regex scans on large tables forever.

### Cert already sold / not available if reliable local data exists

Definition: scanned cert maps to local slab data where `sales_status = 'SOLD'`, `listing_state = 'SOLD'`, or `sold_date is not null`.

Severity:

- Danger warning in UI.
- Do not block scanning in MVP, because slab DB reliability may still be imperfect.
- Must block future sold-writeback commit unless manually overridden.

Current implementation:

- `salesPackingCertValidation.ts` looks up `slabs_dashboard` by cert and flags `not_available` when sales/listing status indicates sold.

Important caveat:

- This warning is only as reliable as local `slabs`/`slabs_dashboard` data. If slab inventory is incomplete, do not present missing certs as proof of invalid stock; show `Cert not found in slab DB` as a warning, not an error.

### Cert not found in local slab DB

Definition: normalized cert has no match in `slabs_dashboard`.

Severity:

- Warn only.
- Not blocking in MVP because Stackt may scan physically real slabs before all slabs are reconciled into the DB.

### Duplicate cert rows in inventory DB

Definition: same normalized cert returns multiple rows from `slabs_dashboard`.

Severity:

- Danger; indicates inventory data problem.
- Packing can continue, but future sold-writeback must refuse until inventory is repaired.

### Metadata needs enrichment

Definition: slab found, but strict `set_abbr + num + lang`/metadata status is incomplete or not confirmed.

Severity:

- Warn.
- It does not invalidate the physical cert scan; it means downstream card/profit/report metadata may be weak.

## Implementation sequence

1. Production schema gate
   - Verify/apply `migrations/023_sales_packing_saved_imports.sql`.
   - Confirm RLS policies allow authenticated select/insert/update on all three sales-packing tables.

2. Persistence hardening
   - Add graceful feature guard around saved-session queries: if tables are missing, show `Saved sessions unavailable` and keep CSV parse/export usable.
   - Consider moving the three-step save into RPC/backend transaction to avoid partial saves.
   - Add `unique(import_id, line_item_key, quantity_unit)` to `sales_packing_rows` if duplicate physical rows become possible.

3. Stable key and duplicate tests
   - Add tests for duplicate `line_item_key` detection.
   - Decide whether `source_line_index` is needed in `line_item_key`; current key is probably fine for normal eBay CSVs but may not distinguish pathological duplicate item lines.

4. Warning UX
   - Add duplicate order visibility, but treat it as informational.
   - Keep duplicate cert in session as danger.
   - Add previous-session cert warning by querying `sales_packing_rows` across other imports.
   - Keep sold/not-available warnings read-only via `slabs_dashboard`.

5. Saved-session UX polish
   - Update docs/UI copy to consistently say Sales Record Number is the packing sequence.
   - Keep Enter-to-next-cert input behavior.
   - Ensure removed rows stay hidden after reopen and exports use only visible rows.

6. Future writeback only after validation/reconciliation
   - Backend/RPC transaction creates/updates `ebay_sales`, links scanned `slabs.id`, and updates slab sale fields atomically.
   - Must block duplicate certs, cert not found/duplicate DB rows, and already-sold rows unless there is an explicit reviewed override.
   - Do not start this until slab inventory truth is trustworthy enough for false-positive warnings not to slow packing.

## Verification performed in this inspection

- Searched the worktree for Sales Packing routes, components, helpers, migrations, and tests.
- Read relevant files listed above.
- Confirmed `migrations/023_sales_packing_saved_imports.sql` defines all three requested saved-session tables.
- Confirmed current code uses those tables directly through Supabase in `SalesPackingPage.tsx`.
- Attempted targeted parser test command `./node_modules/.bin/tsx --test frontend/tests/ebaySalesParser.check.ts`; it could not run because `node_modules` is absent in this worktree.

Recommended verification after dependencies/migration are available:

```bash
npm install
./node_modules/.bin/tsx --test frontend/tests/ebaySalesParser.check.ts
cd frontend && npm run build
```

Then in a migrated Supabase environment:

1. Save a small CSV import.
2. Confirm one import row, one item row per eBay line, one packing row per physical unit.
3. Reopen the saved import.
4. Scan a cert, refresh, and confirm cert persists.
5. Remove a row, refresh, and confirm it stays hidden and export excludes it.
6. Scan the same cert twice and confirm duplicate-in-session warning appears.
7. Scan a cert that exists in `slabs_dashboard` with sold status and confirm sold/not-available warning appears.
