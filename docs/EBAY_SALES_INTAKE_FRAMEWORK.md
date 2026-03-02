# eBay Sales Intake Tool – Framework (Revised)

A detailed design for an app that ingests eBay sales from eBay AU, normalizes them via title parsing (carduploader format), stores them in Supabase, and matches them to slabs via manual cert scanning. Includes a **Packing List** (replacing eBay awaiting postage tab) and a **Manual Match** page with barcode scanning.

---

## 1. Business Context & Current Workflow

### 1.1 Listing Source

- **carduploader.com** – Most listings are generated here.
- **Default title format:** `Grading company > Grade > Card Name > Card Number > Set Number > Set Name > Set abbreviation > Rarity > Language (if not English) > Card Game`
- Titles are sometimes manually adjusted for SEO.

### 1.2 Current Packing Workflow (to replace)

1. Open eBay "Awaiting postage" tab.
2. Pick cards from physical inventory.
3. Manually parse sales data (date, buyer, price) into a spreadsheet.
4. Scan cert on slabs with barcode scanner into spreadsheet.
5. Certs call inventory sheet (Google Sheets) → populate card data (card name, number, acquisition price, grade date, time til sold, profit, etc.).

### 1.3 Desired Workflow

1. **Packing List tab** – Replaces eBay awaiting postage. Shows: **image**, **card name**, **cert** to pick for packing.
2. **Manual Match page** – After packing, match certs with orders. Editable field for barcode scanning.

### 1.4 Matching Approach

- **SKU is NOT used** – No SKU system for most listings (auctions may use SKU; treat as edge case).
- **Primary matching:** Parse listing title → extract grading company, grade, card name, set number, set name, language, card game.
- **Manual approval:** Barcode scanning of certs acts as the manual approval step (parsing is less reliable than SKU).

---

## 2. Goals

| Goal | Description |
|------|-------------|
| **Ingest eBay sales** | Fetch sold orders from eBay AU (Fulfillment API) |
| **Parse titles** | Extract card identity from carduploader-format titles |
| **Store sale records** | Persist in `ebay_sales` with parsed fields |
| **Packing List** | Replace eBay awaiting postage tab – show image, card name, cert for unshipped orders |
| **Manual Match** | Page to scan certs and match sales to slabs (barcode-friendly input) |
| **Update slabs** | Mark matched slabs as sold, set `sold_date`, `sale_price`, `ebay_sale_id` |
| **Refunds/cancellations** | Separate approval page before reverting slab status |

---

## 3. eBay API Strategy

### 3.1 APIs

| API | Purpose | Notes |
|-----|---------|------|
| **Sell Fulfillment API** | Orders, line items, fulfillment status | Primary – `getOrders` with filters |
| **Sell Finances API** | Fees, payouts | Low priority; use if easy to add |

### 3.2 Fulfillment API – getOrders

- **Endpoint:** `GET https://api.ebay.com/sell/fulfillment/v1/order`
- **Auth:** OAuth 2.0 User Token (seller scope)
- **Marketplace:** eBay AU (`EBAY_AU`)
- **Filters:**
  - `order.orderFulfillmentStatus` = `NOT_STARTED` or `IN_PROGRESS` → **awaiting postage** (for Packing List)
  - `creationdate` – date range for sync
- **Range:** Up to 90 days for filter; up to 2 years for date range
- **Returns:** Orders with `lineItems[]` (title, lineItemId, lineItemCost, itemId, image URL if available)

### 3.3 Line Item Data

| Field | Use |
|-------|-----|
| `lineItemId` | Dedupe key |
| `title` | Parse for card identity (carduploader format) |
| `sku` | Only for auctions; optional match |
| `lineItemCost` | Sale price (AUD) |
| `itemId` | eBay listing ID – can fetch primary image from Browse API if needed |
| `orderFulfillmentStatus` | NOT_STARTED / IN_PROGRESS / FULFILLED |

### 3.4 Auth & Credentials

- **App type:** Production (eBay AU)
- **OAuth scope:** `https://api.ebay.com/oauth/api_scope/sell.fulfillment`
- **Token storage:** Env or Supabase vault

---

## 4. Title Parser (carduploader format)

### 4.1 Default Order

`Grading company > Grade > Card Name > Card Number > Set Number > Set Name > Set abbreviation > Rarity > Language (if not English) > Card Game`

### 4.2 Fields to Extract

| Field | Target column | Notes |
|-------|---------------|-------|
| Grading company | `grading_company` | PSA, CGC, BGS, etc. |
| Grade | `grade` | 10, 9.5, etc. |
| Card name | `card_name` | |
| Card number | `num` | |
| Set number | `set_num` | |
| Set name | `set_name` | |
| Set abbreviation | `set_abbr` | Map to `slabs.set_abbr`, `master_cards` |
| Rarity | `rarity` | |
| Language | `lang` | Default ENG if absent; JPN, etc. |
| Card game | `card_game` | Pokemon, etc. |

### 4.3 Parsing Strategy

- **Regex rules** – Define patterns for carduploader format; handle common variations.
- **Fallback** – If regex fails, set `parse_confidence` low and `match_status = 'MANUAL_REVIEW'`.
- **master_cards lookup** – Use `set_abbr` + `num` + `lang` to resolve `card_name` from `master_cards` when possible.

---

## 5. Data Model

### 5.1 New Tables

#### `ebay_sales` (sale records)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `ebay_order_id` | text | |
| `ebay_line_item_id` | text UNIQUE | Dedupe key |
| `ebay_item_id` | text | Listing ID (for image fetch) |
| `ebay_sku` | text | Only for auctions |
| `title` | text | Raw title |
| `quantity` | int | Usually 1 |
| `sale_price` | numeric | AUD |
| `currency` | text | AUD |
| `sold_date` | date | |
| `buyer_username` | text | |
| `fulfillment_status` | text | NOT_STARTED \| IN_PROGRESS \| FULFILLED |
| `image_url` | text | Primary listing image (from eBay if available) |
| **Parsed** | | |
| `card_name` | text | |
| `set_abbr` | text | |
| `num` | text | |
| `set_num` | text | |
| `set_name` | text | |
| `lang` | text | |
| `grade` | text | |
| `grading_company` | text | |
| `rarity` | text | |
| `card_game` | text | |
| `parse_confidence` | numeric | 0–1 |
| `parse_flags` | jsonb | Warnings |
| **Matching** | | |
| `slab_id` | uuid FK → slabs.id | Set by cert scan |
| `match_method` | text | PARSED \| CERT_SCAN \| SKU (auctions only) \| MANUAL |
| `match_status` | text | PENDING \| MATCHED \| UNMATCHED \| MANUAL_REVIEW |
| `matched_at` | timestamptz | When cert was scanned |
| **Metadata** | | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `raw_response` | jsonb | Optional |

#### `ebay_sync_log`

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `started_at` | timestamptz |
| `completed_at` | timestamptz |
| `status` | text |
| `orders_fetched` | int |
| `sales_created` | int |
| `sales_matched` | int |
| `error_message` | text |

#### `ebay_refund_requests` (for approval flow)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `ebay_sale_id` | uuid FK | |
| `slab_id` | uuid FK | |
| `reason` | text | Cancellation/refund reason |
| `status` | text | PENDING \| APPROVED \| REJECTED |
| `requested_at` | timestamptz | |
| `resolved_at` | timestamptz | |
| `resolved_by` | text | |

### 5.2 Slabs Table Changes

| Column | Type | Description |
|--------|------|-------------|
| `sale_price` | numeric | **NEW** |
| `sale_currency` | text | **NEW** – AUD |
| `ebay_sale_id` | uuid FK → ebay_sales.id | **NEW** |

---

## 6. Matching Strategy

### 6.1 Match Priority (no SKU for most listings)

1. **Cert scan (primary)** – User scans cert; match `slabs.cert` → set `slab_id`, `match_method = 'CERT_SCAN'`.
2. **SKU (auctions only)** – If `ebay_sku` present and matches `slabs.sku`, auto-match.
3. **Parsed identity** – Suggest matches from `set_abbr` + `num` + `lang` + `grade` + `grading_company`; user confirms or scans.
4. **Manual** – User selects slab from search/dropdown.

### 6.2 Rules

- Only match slabs with `sales_status = 'LISTED'`.
- Cert scan is the approval step – no auto-match from parsing alone (except SKU for auctions).
- When matched: update `slabs.sold_date`, `slabs.sale_price`, `slabs.ebay_sale_id`; set `ebay_sales.slab_id`, `match_status = 'MATCHED'`, `matched_at`.

---

## 7. UI – Separate Frontend

**Decision:** Separate frontend app for clarity (e.g. `ebay-sales-ui/` or similar).

### 7.1 Packing List Tab

**Replaces:** eBay "Awaiting postage" tab.

**Data source:** `ebay_sales` where `fulfillment_status IN ('NOT_STARTED', 'IN_PROGRESS')`, ordered by `sold_date`.

**Display per row:**

| Column | Source |
|--------|--------|
| Image | `image_url` or eBay listing image via `ebay_item_id` |
| Card name | `card_name` (parsed) or from `master_cards` |
| Cert | Empty until matched; show "—" or "Scan to match" |
| Grade | `grade` |
| Set | `set_abbr` / `set_name` |
| Buyer | `buyer_username` |
| Sale price | `sale_price` |

**Actions:**

- Filter by date, fulfillment status.
- Optional: "Sync from eBay" to refresh.
- Focus on **cert** column for barcode scanning (see Manual Match).

**Layout:** Card grid or table; mobile-friendly for use during packing.

### 7.2 Manual Match Page

**Purpose:** Match certs (from barcode scan) to sales. Acts as manual approval.

**Layout:**

- List of **unmatched sales** (`match_status = 'PENDING'` or `'MANUAL_REVIEW'`), ordered by `sold_date`.
- **Barcode input field** – Focused, large, accepts cert scan. On scan:
  1. Look up `slabs` where `cert = <scanned_value>` and `sales_status = 'LISTED'`.
  2. If single match: auto-link to current/selected sale, update both, show success.
  3. If multiple/no match: show message, allow manual slab search.
- **Editable fields** – Sale row: parsed card name, set, grade (editable if wrong). Slab: show matched slab details.
- **Match button** – Manual match when user selects slab from dropdown/search.

**Flow:**

1. User opens Manual Match page.
2. Sees list of sales needing match.
3. Clicks/focuses barcode input.
4. Scans cert on slab.
5. System matches to sale (or prompts for selection).
6. Repeat.

### 7.3 Sales Inbox (optional list view)

- All `ebay_sales` with filters: date, `match_status`, `fulfillment_status`.
- Columns: sold_date, title, sale_price, match_status, slab (if matched), fulfillment_status.
- Link to Manual Match for unmatched rows.

### 7.4 Refund / Cancellation Approval Page

**Purpose:** Before reverting slab status on refund/cancel.

**Flow:**

1. Detect refund/cancellation (eBay API or manual entry).
2. Create `ebay_refund_requests` row with status `PENDING`.
3. Approval page lists pending requests.
4. User reviews: slab, sale, reason.
5. Approve → revert slab (`sold_date` = null, `sale_price` = null, `ebay_sale_id` = null); mark sale/refund record.
6. Reject → no change to slab.

---

## 8. Architecture

### 8.1 Components

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  eBay API       │     │  eBay Sales      │     │  Supabase       │
│  (Fulfillment)  │────▶│  Intake Service  │────▶│  ebay_sales,    │
│  eBay AU        │     │  - Fetch orders  │     │  slabs,         │
│                 │     │  - Parse titles  │     │  master_cards   │
└─────────────────┘     │  - Store sales   │     └─────────────────┘
                        └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Cron / Manual   │
                        │  Sync trigger    │
                        └──────────────────┘

┌─────────────────┐
│  eBay Sales UI  │  ← Separate frontend
│  - Packing List │
│  - Manual Match │
│  - Refund Approve│
└─────────────────┘
```

### 8.2 Placement

- **Backend:** `ebay-sales/` – Node/Express or Next.js API, shared Supabase.
- **Frontend:** Separate app (e.g. `ebay-sales-ui/`), same auth (Supabase Auth).

### 8.3 Sync Flow

1. Cron or manual trigger.
2. Fetch orders from eBay (filter: `creationdate` from last sync, or `orderFulfillmentStatus` for awaiting postage).
3. Dedupe by `ebay_line_item_id`.
4. Parse each new line item title (carduploader format) → normalized fields.
5. Store in `ebay_sales`; do **not** auto-match to slabs (except SKU for auctions).
6. Log `ebay_sync_log`.

---

## 9. API / Job Design

| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs/sync-ebay` | Sync from eBay (CRON_SECRET) |
| GET | `/sales` | List sales (filters: date, match_status, fulfillment_status) |
| GET | `/sales/packing` | Sales awaiting shipment (NOT_STARTED, IN_PROGRESS) |
| GET | `/sales/:id` | Sale detail + suggested slabs |
| PATCH | `/sales/:id/match` | Set `slab_id` by cert or manual |
| POST | `/sales/match-by-cert` | Body: `{ cert, sale_id }` – match by scanned cert |
| GET | `/refunds/pending` | Pending refund requests |
| POST | `/refunds/:id/approve` | Approve revert |
| POST | `/refunds/:id/reject` | Reject |

---

## 10. Fees (Low Priority)

- Use **Sell Finances API** `getTransactions` if straightforward.
- Store fee/payout data on `ebay_sales` or separate table when added.
- No built-in fee calculator required for MVP.

---

## 11. Security & Secrets

| Secret | Purpose |
|--------|---------|
| `EBAY_APP_ID` | eBay app ID |
| `EBAY_CERT_ID` | eBay cert ID |
| `EBAY_REFRESH_TOKEN` | OAuth (eBay AU seller) |
| `EBAY_ENVIRONMENT` | `production` |
| `CRON_SECRET` | Protect sync |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | DB |

---

## 12. Migration Order

1. `010_ebay_sales_tables.sql` – `ebay_sales`, `ebay_sync_log`, `ebay_refund_requests`
2. `011_slabs_sale_fields.sql` – Add `sale_price`, `sale_currency`, `ebay_sale_id` to `slabs`
3. Recreate `slabs_dashboard` / `slabs_enriched` views

---

## 13. Phased Rollout

| Phase | Scope |
|-------|-------|
| **Phase 1** | Fetch orders, parse titles (carduploader), store in `ebay_sales`, no slab updates |
| **Phase 2** | Packing List UI – show awaiting shipment with image, card name, cert placeholder |
| **Phase 3** | Manual Match page – barcode input, cert → slab match, update slabs |
| **Phase 4** | Refund approval page, Finances API (fees) |
| **Phase 5** | SKU support for auctions (optional) |

---

## 14. Execution Checklist for Agent

- [ ] Create `ebay-sales/` backend (Node/Express or Next.js API)
- [ ] eBay OAuth + Fulfillment API client
- [ ] Title parser for carduploader format (regex + fallbacks)
- [ ] Migrations: `ebay_sales`, `ebay_sync_log`, `ebay_refund_requests`, slabs columns
- [ ] Sync job: fetch, parse, store
- [ ] API: `/sales`, `/sales/packing`, `/sales/:id/match`, `/sales/match-by-cert`
- [ ] Create separate frontend app
- [ ] Packing List page – awaiting shipment, image, card name, cert
- [ ] Manual Match page – barcode input, cert scan → match
- [ ] Refund approval page (Phase 4)
- [ ] Cron for sync
- [ ] Auth: Supabase Auth, same as existing apps
