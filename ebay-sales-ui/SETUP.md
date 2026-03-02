# eBay Sales UI – Next Steps

## 1. Configure the frontend

Create `ebay-sales-ui/.env.local` with:

```
VITE_SUPABASE_URL=<same as ebay-sales>
VITE_SUPABASE_ANON_KEY=<same as ebay-sales>
VITE_EBAY_SALES_API_URL=http://localhost:3002
```

Use the same Supabase URL and anon key as in `ebay-sales/.env.local`.

## 2. Start the frontend

```bash
cd ebay-sales-ui && npm run dev
```

Opens at http://localhost:3003

## 3. Sign in and test

1. Open http://localhost:3003
2. Sign in with your Supabase account (same as frontend/psa-tracker)
3. Go to **Packing List** and click **Sync from eBay** to pull orders
4. Use **Manual Match** to scan certs and match sales to slabs

## 4. Optional: cron sync

To run sync on a schedule, call:

```
POST http://localhost:3002/api/jobs/sync-ebay
Authorization: Bearer <CRON_SECRET>
```

Or: `GET http://localhost:3002/api/jobs/sync-ebay?secret=<CRON_SECRET>`
