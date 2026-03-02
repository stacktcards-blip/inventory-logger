# eBay Sales UI

Frontend for the eBay Sales Intake Tool. Packing List, Manual Match, Sales Inbox, and Refund Approval.

## Setup

1. Copy `.env.example` to `.env.local`
2. Set Supabase URL and anon key (same as inventory-logger)
3. Set `VITE_EBAY_SALES_API_URL` (default: http://localhost:3002)

## Run

```bash
npm install
npm run dev   # http://localhost:3003
```

Ensure the ebay-sales API is running on port 3002.
