# PSA Order Tracker / Grading Order Viewer

Production-ready web app to track PSA grading orders, sync status from PSA, capture tracking numbers, and (Phase 2+) monitor shipments with Telegram notifications.

Uses the same Supabase instance as the existing Slabs Inventory UI.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind
- **Backend**: Next.js API routes
- **Database**: Supabase Postgres via supabase-js
- **Auth**: Supabase Auth (email/password)

## Setup

### 1. Install dependencies

```bash
cd psa-tracker
pnpm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

Required:

- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Anon key (public)
- `SUPABASE_SERVICE_ROLE_KEY` – Service role key (server-only, for sync/cron)
- `CRON_SECRET` – Random string to protect `/api/sync/all`

Optional (Phase 2):

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` – for delivery notifications
- `DHL_API_KEY` – from [developer.dhl.com](https://developer.dhl.com) (Shipment Tracking - Unified)
- `APP_BASE_URL` – for deep links in Telegram (default: http://localhost:3001)

### 3. Apply SQL migrations in Supabase

Run in Supabase SQL Editor (in order):

1. `migrations/006_psa_tracker_tables.sql` – Creates `psa_orders`, `psa_order_cards`, `psa_order_events`, `psa_notifications`
2. `migrations/007_psa_tracker_rls.sql` – Enables RLS and policies for authenticated users

### 4. Run locally

```bash
pnpm dev
```

App runs at http://localhost:3001

### 5. Create a user

Use Supabase Dashboard → Authentication → Users to create a user, or enable email sign-up and register via the login page.

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orders` | List orders (filters: status, shipped, delivered, exception) |
| POST | `/api/orders` | Create order |
| GET | `/api/orders/:id` | Get order with cards |
| PUT | `/api/orders/:id` | Update order |
| POST | `/api/orders/:id/cards` | Add card |
| POST | `/api/orders/:id/cards/import` | Import cards from CSV |
| POST | `/api/orders/:id/sync` | Sync one order (PSA status) |
| POST | `/api/orders/:id/shipment-sync` | Sync one order's DHL shipment status |
| POST | `/api/sync/all` | Sync all orders + shipments (cron; requires `Authorization: Bearer <CRON_SECRET>`) |
| POST | `/api/orders-new/sync-gmail` | Sync orders from Gmail (scrape PSA emails; requires Gmail OAuth) |
| POST | `/api/orders-new/sync-invoice` | Sync invoice data from Gmail (PSA Invoices from info@psacard.com) |
| GET | `/api/health` | Health check |
| GET | `/api/debug/psa?orderNumber=X` | Debug PSA API (returns raw response) |

## PSA sync troubleshooting

If sync returns "Order not found in PSA":

1. **Debug endpoint** – Open `http://localhost:3001/api/debug/psa?orderNumber=YOUR_NUMBER` to see the raw PSA API response for both `GetProgress` and `GetSubmissionProgress`.
2. **Number format** – Use the exact number shown on [PSA Order Status](https://psacard.com/orderstatus) (order number or submission number).
3. **Account link** – The order must be linked to the PSA account that generated your API token.
4. **Mock mode** – Set `PSA_USE_MOCK=true` in `.env.local` (or remove `PSA_API_TOKEN`) to use mock data. Mock supports orders `12345678`, `87654321`, `11111111`.

## Cron setup (Phase 2)

**Option A: Supabase Edge Function** (deployed as `psa-sync-cron`)

1. In Supabase Dashboard → Edge Functions → `psa-sync-cron` → Secrets, add:
   - `APP_BASE_URL` = your deployed app URL (e.g. https://your-app.vercel.app)
   - `CRON_SECRET` = same as in your Next.js app
2. Schedule via external cron (e.g. [cron-job.org](https://cron-job.org)) to invoke the Edge Function URL every 6 hours (or every 8 hours for Orders NEW status checks).

**Option B: Direct API call**

```bash
0 */6 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.com/api/sync/all
```

## Orders NEW (development tab)

When running in development (or when `NEXT_PUBLIC_PSA_ORDERS_NEW_TAB=true`), an **Orders NEW** tab appears.

**Data model:**
- **Submission number** is the main key for linking PSA orders from email (first column). It comes from “We Received Your Package” emails and from invoice lines; one submission can be associated with more than one order number.
- **Order number** is used for follow-up on billing and tracking (second column).

- **Sync from Gmail** – Searches Gmail for subject **"We Received Your Package"** from **no-reply@psacard.com**. Reads the email body for **Submission #** (8-digit numbers in the table). Creates one row per submission in `psa_orders` (stored as the main identifier). The same query is used by the cron job for this flow.
- **Sync PSA status** – For each row in the DB, calls the PSA API to retrieve **submission number**, **order number**, and other data (status, service level, tracking, etc.), and updates the DB. Run via cron every 8 hours if desired.
- **Sync to invoice** – Searches Gmail for **"PSA Invoices"** from **info@psacard.com**. Parses the table (Order No., Submission No., Order Amount, Payment Amount, Balance Due) and upserts into `psa_order_invoice_lines`, **matching by submission number** in the DB. Updates `billed_amount_usd` from invoice totals. One submission can have multiple order numbers (shown in the table and on the order detail page).
- **Table** – **Submission number**, **Order number**, Service, **Sent date** (from Sync shipped), **Arrive** (from Sync from Gmail / received package email), Status, Billed (USD), Tracking, **Shipping status** (DHL etc. from shipment sync), Actions (View, **Archive**). Rows with **billed amount > $720** are highlighted red (expect duties).

**Gmail setup:**
1. Create OAuth2 credentials (Desktop or Web application) in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Enable the Gmail API.
2. Add this **Authorized redirect URI**: `http://localhost:3001/api/orders-new/gmail-oauth/callback` (or your `APP_BASE_URL` + `/api/orders-new/gmail-oauth/callback`).
3. Put `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in `.env.local`.
4. Open **http://localhost:3001/api/orders-new/gmail-oauth** in your browser. Sign in with the Google account that receives PSA emails and grant access. The callback page will show your **refresh token**; add it to `.env.local` as `GMAIL_REFRESH_TOKEN`.

**Migrations:** Run `migrations/012_orders_new_fields.sql` to add `estimated_arrival_date`, `billed_amount_usd` to `psa_orders`; `014_drop_submission_date.sql` removes `submission_date`.

## Phase plan

| Phase | Status | Scope |
|-------|--------|-------|
| **Phase 0** | Done | Repo setup, Supabase, auth, schema |
| **Phase 1 (MVP)** | Done | Orders list/detail, CRUD, cards add/import, PSA sync (mock), tracking capture, email parser |
| **Phase 2** | Done | DHL shipment monitoring, Telegram notifications, dedupe, Edge Function cron |
| **Phase 3** | Pending | Cross-reference with Slabs Inventory (read-only adapter + config) |

## Cross-reference with Slabs (Phase 3)

When Phase 3 is implemented:

- Adapter will accept card identity: `cert_number`, `psa_order_number`, `set_abbr`, `card_number`, `lang`, `card_name`, `sku`
- Mapping config (JSON) will define table/column names for `slabs`, `master_cards` so the app can adapt if schema differs
- Matching strategy inferred from existing Slabs Inventory UI: `slabs.cert`, `slabs.order_number`, `slabs.set_abbr`+`num`+`lang`
- UI will show "Matched slab(s)" on order card rows with link to Slabs Inventory

## CLI: Email tracking parser

Test extraction of tracking numbers from email body:

```bash
# Use sample email
pnpm run parse-email

# Parse a file
pnpm run parse-email path/to/email.txt

# Pipe
cat email.txt | pnpm run parse-email
```

## File structure

```
psa-tracker/
├── migrations/
│   ├── 006_psa_tracker_tables.sql
│   └── 007_psa_tracker_rls.sql
├── scripts/
│   └── parse-email.ts
├── src/
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── login/
│   │   ├── orders/
│   │   └── layout.tsx
│   ├── components/
│   ├── lib/
│   │   ├── supabase/
│   │   ├── sync/          # PSA sync engine
│   │   ├── tracking/     # Email parser
│   │   └── notifications/
│   └── types/
└── docs/
    └── ARCHITECTURE.md
```
