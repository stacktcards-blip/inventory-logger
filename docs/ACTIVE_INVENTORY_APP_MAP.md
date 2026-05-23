# Active Inventory App Map

This document maps the currently active inventory app in this repository.

The business currently uses the `frontend/` app as the main UI. It connects directly to Supabase for most inventory reads/writes and calls the root Express backend for selected workflows, especially slab intake.

## Active Scope

Currently active day-to-day app:

- `frontend/` — Vite + React + TypeScript UI
- root `src/` — Express + TypeScript backend
- Supabase — database, auth, views, and RPC functions

Older/side apps that exist in the repo but are not currently the main workflow:

- `psa-tracker/`
- `ebay-sales/`
- `ebay-sales-ui/`

These older apps may contain useful code or ideas, but changes for the main inventory app should normally focus on `frontend/`, root `src/`, and the shared Supabase migrations.

## High-Level Architecture

```txt
frontend/
  ├─ Supabase Auth
  ├─ Direct Supabase reads/writes for inventory screens
  └─ Calls root backend for slab-intake API

root backend src/
  ├─ Gmail ingest and Japanese purchase email parsing
  ├─ purchase source/draft approval and commit flow
  └─ PSA certificate lookup and slab intake commit flow

Supabase
  ├─ Auth
  ├─ Core tables
  ├─ Dashboard/enriched views
  └─ RPC functions for commit/tally workflows
```

Important architectural note: the app is not purely `frontend -> backend -> database`.

Most active inventory screens talk directly from the browser frontend to Supabase using the anon key and the logged-in user's session. The backend is used for workflows that require server-side secrets or external APIs.

## Frontend App

Location:

```txt
frontend/
```

Tech stack:

- Vite
- React
- TypeScript
- React Router
- Supabase JS client
- Tailwind CSS
- TanStack React Table

Key files:

```txt
frontend/src/main.tsx
frontend/src/App.tsx
frontend/src/lib/supabase.ts
frontend/src/contexts/AuthContext.tsx
frontend/src/components/ProtectedRoute.tsx
frontend/src/components/AppLayout.tsx
```

### Environment Variables

Frontend Supabase client:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Slab intake backend URL:

```txt
VITE_API_URL=http://localhost:4000
```

If `VITE_API_URL` is not set, `frontend/src/lib/slabIntakeApi.ts` defaults to:

```txt
http://localhost:4000
```

## Frontend Routes

Defined in:

```txt
frontend/src/App.tsx
```

Routes:

```txt
/login              -> LoginPage
/                   -> SlabsPage
/slab-intake        -> SlabIntakePage
/grading-orders     -> GradingOrdersPage
/raw-cards          -> RawCardsPage
/raw-cards/add      -> AddRawCardsPage
```

Navigation layout:

```txt
frontend/src/components/AppLayout.tsx
```

Visible nav links:

- Slabs
- Slab Intake
- Grading Orders
- Raw Cards
- Add raw cards

## Auth Flow

Files:

```txt
frontend/src/contexts/AuthContext.tsx
frontend/src/components/ProtectedRoute.tsx
frontend/src/pages/LoginPage.tsx
```

Flow:

```txt
Supabase email/password auth
  -> AuthProvider tracks session/user
  -> ProtectedRoute blocks unauthenticated access
  -> unauthenticated users are sent to /login
```

## Raw Cards Inventory Flow

Main page:

```txt
frontend/src/pages/RawCardsPage.tsx
```

Core hook:

```txt
frontend/src/hooks/useRawCards.ts
```

Components:

```txt
frontend/src/components/RawCardsFilters.tsx
frontend/src/components/RawCardsTable.tsx
frontend/src/components/RawCardsPagination.tsx
frontend/src/components/RawCardDetailModal.tsx
frontend/src/components/CardTallyPanel.tsx
```

### Reads

`useRawCards` reads from:

```txt
raw_cards_enriched
```

This view enriches `raw_cards` rows with data from `master_cards`, such as card name and rarity.

Filters:

- set abbreviation
- card number
- language
- seller
- purchase date from/to
- search text across set/card/seller/note fields

Sort fields:

- `purchase_date`
- `created_at`
- `purchase_price`
- `set_abbr`
- `num`
- `seller`

Pagination:

- 100 rows per page

### Writes

Inline table edits and detail modal saves write directly to:

```txt
raw_cards
```

Editable fields:

- `set_abbr`
- `num`
- `lang`
- `currency`
- `purchase_price`
- `exchange_rate`
- `cond`
- `seller`
- `purchase_date`
- `note`
- `is_1ed`
- `is_rev`

### Card Tally

Component:

```txt
frontend/src/components/CardTallyPanel.tsx
```

Calls Supabase RPC:

```txt
raw_cards_tally
```

Inputs:

- set abbreviation
- card number
- optional language

Returns:

- total quantity
- JPY quantity / average price / total cost
- AUD quantity / average price / total cost

## Add Raw Cards Flow

Page:

```txt
frontend/src/pages/AddRawCardsPage.tsx
```

Purpose:

- manually enter raw card inventory rows
- import rows from CSV
- download CSV template
- look up card names from master data
- insert valid rows into inventory

CSV headers:

```txt
Set
Num
Lang
Card name
CCY
Price
Exch
Seller
Date
Cond
1ed
Rev
Note
```

Card name lookup reads from:

```txt
master_cards
```

Bulk insert writes to:

```txt
raw_cards
```

Important note: card name is not inserted into `raw_cards`. It is resolved through `raw_cards_enriched` by joining against `master_cards`.

## Slabs Inventory Flow

Main page:

```txt
frontend/src/pages/SlabsPage.tsx
```

Core hook:

```txt
frontend/src/hooks/useSlabs.ts
```

Components:

```txt
frontend/src/components/SlabsFilters.tsx
frontend/src/components/SlabsStatsCards.tsx
frontend/src/components/SlabsTable.tsx
frontend/src/components/SlabsPagination.tsx
frontend/src/components/SlabsBulkActions.tsx
frontend/src/components/SlabDetailModal.tsx
frontend/src/components/LinkRawCardModal.tsx
```

### Reads

Slabs list reads from:

```txt
slabs_dashboard
```

Slab detail modal reads from:

```txt
slabs_enriched
```

Grading order-related slab data also uses:

```txt
grading_orders_dashboard
```

### Writes

Slab edits and bulk actions write directly to:

```txt
slabs
```

Common actions:

- mark selected slabs as listed
- mark selected slabs as sold
- edit cert/grade/note/dates
- link slab to a raw card

## Slab Intake Flow

Frontend page:

```txt
frontend/src/pages/SlabIntakePage.tsx
```

Frontend API client:

```txt
frontend/src/lib/slabIntakeApi.ts
```

Backend route:

```txt
src/routes/slabIntake.ts
```

Purpose:

```txt
PSA cert number
  -> backend checks for duplicate slab or draft
  -> backend calls PSA API
  -> backend maps PSA data into a draft
  -> user reviews/edits draft
  -> user approves/rejects
  -> approved draft commits to slabs
```

Frontend calls:

```txt
POST /slab-intake/fetch
GET /slab-intake/drafts?status=pending
GET /slab-intake/drafts/:id
PATCH /slab-intake/drafts/:id
POST /slab-intake/drafts/:id/approve
POST /slab-intake/drafts/:id/reject
POST /slab-intake/drafts/:id/commit
```

Backend files involved:

```txt
src/routes/slabIntake.ts
src/services/psaCertClient.ts
src/adapters/psaCertToSlabDraft.ts
src/repositories/slabIntakeDraftsRepo.ts
src/services/slabIntakeCommitService.ts
```

Database object:

```txt
slab_intake_drafts
```

Migration:

```txt
migrations/022_slab_intake_drafts.sql
```

## Root Backend App

Location:

```txt
src/
```

Tech stack:

- Express
- TypeScript
- Supabase service-role client
- Gmail API
- PSA API
- Pino logging

Entry point:

```txt
src/index.ts
```

Mounted routes:

```txt
/jobs         -> src/routes/jobs.ts
/sources      -> src/routes/sources.ts
/drafts       -> src/routes/drafts.ts
/slab-intake  -> src/routes/slabIntake.ts
/healthz      -> health check
```

### Backend Environment Variables

Required for Supabase service-role access and backend auth:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY          # verifies frontend Supabase JWTs
SUPABASE_SERVICE_ROLE_KEY  # service-role DB access; server-side only
ALLOWED_USER_IDS           # comma-separated Supabase user IDs
# or ALLOWED_USER_EMAILS
```

Required for Gmail ingest/parsing:

```txt
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
GMAIL_REDIRECT_URI
```

Server config:

```txt
PORT=4000
CORS_ORIGIN=http://localhost:5173
```

PSA cert lookup:

```txt
PSA_API_TOKEN
# or
PSA_API_KEY
```

## Gmail Purchase Email Flow

Backend routes:

```txt
POST /jobs/ingest-gmail
POST /jobs/parse-pending
```

Files:

```txt
src/routes/jobs.ts
src/jobs/ingestGmail.ts
src/jobs/parsePending.ts
src/services/gmailClient.ts
src/services/gmailParser.ts
src/parsers/
src/config/japanStores.ts
```

Flow:

```txt
Gmail purchase email
  -> purchase_sources
  -> purchase_parses
  -> purchase_drafts
  -> manual review
  -> purchase source approval
  -> commit_purchase_source RPC
  -> raw_cards insert
  -> purchase_commits audit row
```

Related backend endpoints:

```txt
GET /sources?status=needs_review
GET /sources/:id
PATCH /drafts/:id
POST /sources/:id/approve
POST /sources/:id/commit
```

Related files:

```txt
src/routes/sources.ts
src/routes/drafts.ts
src/services/commitService.ts
src/repositories/purchaseSourcesRepo.ts
src/repositories/purchaseDraftsRepo.ts
src/repositories/purchaseParsesRepo.ts
src/repositories/purchaseCommitsRepo.ts
src/adapters/rawCardsAdapter.ts
```

## Key Supabase Objects

### Main inventory

```txt
raw_cards
raw_cards_enriched
master_cards
raw_cards_tally
```

### Slabs

```txt
slabs
slabs_dashboard
slabs_enriched
grading_orders_dashboard
slab_intake_drafts
```

### Purchase email workflow

```txt
purchase_sources
purchase_drafts
purchase_parses
purchase_commits
commit_purchase_source
```

## Important Migrations

Raw cards / enrichment / tally:

```txt
migrations/016_raw_cards_enriched_case_insensitive.sql
migrations/017_raw_cards_tally.sql
migrations/018_add_currency_to_raw_cards.sql
migrations/019_raw_cards_tally_currency_breakdown.sql
```

Slabs and raw-card linking:

```txt
migrations/003_add_slabs_pk.sql
migrations/004_link_slabs_to_raw_cards_by_sku.sql
migrations/005_add_grading_order_id_to_slabs_dashboard.sql
migrations/011_slabs_sale_fields.sql
migrations/021_slabs_dashboard_raw_cost.sql
```

Slab intake:

```txt
migrations/022_slab_intake_drafts.sql
```

Purchase email workflow:

```txt
migrations/001_create_purchase_tables.sql
migrations/002_commit_purchase_source.sql
migrations/020_update_commit_purchase_source_currency.sql
```

## Older / Side Projects

### `psa-tracker/`

Next.js app with its own PSA order tracking, Gmail, DHL/shipment sync, Supabase helpers, and migrations.

Treat as legacy/reference unless specifically working on PSA order tracking.

### `ebay-sales/`

Next.js app for eBay sales/OAuth-related workflows.

Potentially useful later for connecting eBay sales back into inventory, but not the current main inventory UI.

### `ebay-sales-ui/`

Vite React UI for eBay sales.

Likely legacy/reference unless revived.

## Current Risks / Watch Points

### Browser writes directly to Supabase

The frontend writes directly to `raw_cards` and `slabs`.

This is convenient for an internal app, but it means Supabase Row Level Security and database constraints must be correct.

Risk areas:

- unauthorized edits if RLS is too broad
- weak validation if logic only lives in UI
- accidental bulk changes without server-side guardrails

Recommended future audit:

- review RLS policies
- add database constraints where practical
- move high-risk writes to backend endpoints or RPC functions with validation/audit logs

### CSV parsing is hand-written

`AddRawCardsPage.tsx` includes a small custom CSV parser.

Potential edge cases:

- escaped quotes
- multiline quoted fields
- unusual Excel exports

Recommended future improvement:

- use a library such as Papa Parse
- add a validation/preview step before insert

### Batch actions need stronger review UX

High-impact actions include:

- bulk raw-card insert
- inline inventory edits
- bulk mark slabs listed/sold

Recommended future improvement:

- confirmation summary before batch commit
- validation warnings
- optional undo/audit trail

### Root backend dependency lockfile

The root project has `package.json`, but no root `package-lock.json` was found during audit.

Recommended future improvement:

- run `npm install` at repo root
- commit generated root `package-lock.json` if the root backend remains active

## Recommended Improvement Roadmap

### 1. Raw-card intake validation

Add review warnings before saving raw cards:

- missing card-name match
- missing condition
- missing seller
- missing purchase date
- suspicious price
- missing exchange rate for JPY
- invalid currency
- possible duplicate rows

### 2. Faster inventory entry

Improve `AddRawCardsPage` with:

- paste from spreadsheet
- bulk apply seller/date/currency/exchange rate
- keyboard-first row entry
- duplicate row action
- auto-uppercase set/lang/currency
- row-level validation badges

### 3. Operations dashboard

Create an inventory problems dashboard:

- raw cards missing metadata
- slabs not linked to raw cards
- slabs listed but not sold after X days
- possible duplicate raw cards
- rows with missing/invalid costs
- cards physically present but not listed

### 4. eBay listing prep queue

Future workflow:

```txt
raw_cards / slabs
  -> listing candidate queue
  -> title/description/price/photo checklist
  -> eBay draft/export/upload
  -> listed_date tracking
```

### 5. Stronger backend boundaries

For business-critical writes, consider moving from browser-direct writes to:

- backend endpoints
- Supabase RPC functions
- stricter validation and audit logging

This is especially relevant as more people/tools interact with the app.

## Safe Editing Guidelines

When improving the active inventory app:

1. Prefer changes in `frontend/` for UI/UX improvements.
2. Prefer root `src/` for PSA/Gmail/server-side/API workflows.
3. Use migrations for database schema, views, and RPC functions.
4. Treat `psa-tracker/`, `ebay-sales/`, and `ebay-sales-ui/` as reference unless explicitly working on those apps.
5. Do not commit secrets or local data.
6. Keep `.env.example` updated when adding new environment variables.
7. For risky data writes, add validation and confirmation before convenience.
