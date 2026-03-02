# eBay Sales API

Backend for the eBay Sales Intake Tool. Syncs orders from eBay AU, parses carduploader-format titles, stores sales in Supabase, and provides API for Packing List, Manual Match, and Refund Approval.

## Setup

1. Copy `.env.example` to `.env.local`
2. Set Supabase credentials (same project as inventory-logger)
3. Set eBay OAuth credentials (App ID, Cert ID, Refresh Token)
4. Set `CRON_SECRET` for sync job protection

### If the refresh token is invalid

Visit **http://localhost:3002/oauth** to generate a new refresh token:

1. In eBay Developer Portal → Application Keys → User Tokens, create or select a RuName:
   - Set **Auth Accepted URL** to `http://localhost:3002/oauth`
   - Copy the **RuName string** (e.g. `James_James-StacktCa-SalesLog-PRD-xxxxx`) – this is NOT the URL
2. Add `NEXT_PUBLIC_EBAY_APP_ID` and `NEXT_PUBLIC_EBAY_RUNAME` to `.env.local`. Use the RuName *string*, not the redirect URL.
3. Open http://localhost:3002/oauth, click "Authorize with eBay", sign in with your seller account (e.g. 2stackt), and copy the refresh token into `EBAY_REFRESH_TOKEN`
4. Restart the ebay-sales server

## Run

```bash
npm install
npm run dev   # http://localhost:3002
```

## API

- `GET /api/health` - Health check
- `POST /api/jobs/sync-ebay` - Sync from eBay (requires `Authorization: Bearer <CRON_SECRET>`)
- `POST /api/sales/trigger-sync` - User-triggered sync (requires auth)
- `GET /api/sales/packing` - Sales awaiting shipment
- `GET /api/sales` - List sales (filters: match_status, fulfillment_status, date_from, date_to)
- `GET /api/sales/:id` - Sale detail + suggested slabs
- `POST /api/sales/match-by-cert` - Match by cert scan
- `PATCH /api/sales/:id/match` - Manual match
- `GET /api/refunds/pending` - Pending refund requests
- `POST /api/refunds/:id/approve` - Approve refund
- `POST /api/refunds/:id/reject` - Reject refund

All auth-required routes expect `Authorization: Bearer <supabase_access_token>`.
