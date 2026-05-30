# Current Inventory Logger Roadmap

Updated after raw-card paste intake, raw-card bulk edit, and the CSV-first Sales Packing MVP.

## Guiding principle

Build the app around Stackt's daily operational bottlenecks, not around a generic inventory dashboard.

Priority order:

1. Reduce packing mistakes and spreadsheet handling.
2. Preserve cert-level slab truth.
3. Keep raw-card intake faster than Google Sheets.
4. Add exception queues before broad dashboards.
5. Only add marketplace/API automation after the manual workflow is proven.

## Shipped / working

### Raw-card intake

- Spreadsheet-like paste intake at `/raw-cards/add`.
- Batch defaults for seller, purchase date, currency, exchange rate, language, and condition.
- Flexible header parsing and quantity expansion.
- Validation/warning badges before commit.
- Raw-card bulk edit on `/raw-cards` with checkbox selection, shift-click range selection, and a bulk edit bar.

Current stance: do not spend more here unless real intake batches expose friction. Saved draft batches remain low priority because raw-card batches are usually finished in one sitting.

### Slab inventory basics

- Slab list/detail/edit flow.
- Slab primary key model documented: use `slabs.id` for programmatic writes, `slabs.cert`/`sku` for display/search, and `raw_card_id` for raw-card linkage.
- PSA cert slab intake draft/approve/commit flow exists.

### Sales Packing MVP

- Route: `/sales-packing`.
- Upload or paste eBay Paid & Posted CSV.
- Parse item rows, skip footer/summary rows, inherit combined-order context.
- Expand quantity into one row per physical slab.
- Add cert scan/manual field per physical row.
- Flag missing SKU/custom label, high-value missing SKU, combined orders, multi-quantity rows, and blank item/title.
- Remove non-slab/unwanted rows from the working view/export.
- Export expanded CSV.
- Rows now sort by ascending order number for packing flow.
- Pressing Enter after scanning a cert moves focus to the next visible cert field for continuous barcode scanning.

## Current build: Sales Packing saved sessions MVP

MVP 1 saves uploaded eBay CSV sales into Supabase without marking slabs sold:

- `sales_packing_imports` stores one saved upload/session.
- `sales_packing_item_rows` stores one row per eBay line item.
- `sales_packing_rows` stores one row per physical packing/cert-scan item.
- The Sales Packing page can reopen saved sessions.
- Cert scans and removed rows persist to Supabase.
- Inventory writeback is deliberately out of scope until cert validation is safe.

## Next build: Sales Packing V1.1

This is the current highest-ROI area because it touches every packing day and can reduce cert/order mistakes.

### 1. Improve scan ergonomics

- Keep cert inputs keyboard-first.
- Add clearer focused/current-row styling.
- Continue improving scan progress summary: pending vs scanned.

### 2. Add read-only cert validation against Supabase

When a cert is scanned, check:

- cert exists in `slabs`;
- slab is not already sold;
- slab is listed or otherwise eligible to ship;
- duplicate cert was not scanned elsewhere in the same session;
- scanned slab identity roughly matches the sale title when possible.

Do not write inventory changes in this phase. Treat it as packing-day validation only.

### 3. Improve export / sales-log compatibility

- Match the current `STACKT SALE.xlsx` slab-sale import shape as closely as possible.
- Preserve audit fields: order number, sales record number, item number, buyer, sale date, sale price excluding postage, tracking number, title, warnings.

## Next after validation: controlled sold writeback

Once Sales Packing validation feels safe, add a transaction-backed commit flow:

1. create/update `ebay_sales` from parsed CSV row;
2. link scanned cert to `slabs.id`;
3. set sale fields on `slabs`;
4. mark `ebay_sales.match_method = 'CERT_SCAN'` and `match_status = 'MATCHED'`;
5. record enough audit data to unwind mistakes.

Prefer backend endpoint or Supabase RPC for this write path. Avoid fragile browser-only multi-table writes for business-critical sales state.

## Next operational dashboard

Build an exception dashboard, not a generic pretty dashboard.

Queues to include:

- slabs listed but not linked to raw card;
- slabs missing cert/grade/set/num/lang;
- slabs sold but missing sale price;
- slabs listed but unsold after X days;
- raw cards missing condition/seller/date/cost;
- raw cards with missing/invalid exchange rate;
- suspicious duplicate raw-card rows;
- high-value stock missing critical fields.

## Bigger schema work: lifecycle/status model

Do this after packing improvements unless card-at-grader visibility becomes urgent.

The app should eventually separate:

- physical item identity;
- grading events and cert history;
- physical location;
- listing status;
- sale/fulfilment status;
- exception lane: suspicious slab, cracked, regrade, ZNG consignment.

Reason: Stackt's real workflow allows raw → graded slab → cracked raw → regraded slab, and slabs may be listed before physically returning from the grader.

## Deferred for now

### Full eBay API sync

Useful later, but CSV-first is safer while the packing workflow is still being proven. Avoid OAuth/API complexity until cert-scan validation and writeback are stable.

### eBay finance/fees API

Lower priority than cert-level sales integrity.

### Supplier-specific purchase parsers

Useful later for Card Rush, Hareruya2, Snkrdunk, etc., but lower ROI than packing and exception workflows right now.

### Saved raw-card intake drafts

Low priority unless real use shows interruption/data-loss risk.

## Quality gates

For inventory app changes:

- Add/update helper tests before behavior changes where practical.
- Run targeted check tests.
- Run root `npm test`.
- Run `cd frontend && npm run build`.
- Avoid committing secrets, local exports, customer data, or generated build folders.
