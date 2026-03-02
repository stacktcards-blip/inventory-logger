# Phase 2 Prerequisites

Captured decisions and what’s needed before implementation.

## Confirmed Decisions

| Item | Decision |
|------|----------|
| Shipping API | DHL Shipment Tracking - Unified (pull) |
| Cron | Supabase Edge Function (scheduled) |
| DHL poll interval | Every 6 hours |
| Notification events | Out for delivery, delivered, exceptions only |
| App base URL (dev) | http://localhost:3001 |

## What We Have

- [x] Telegram bot token (add to `.env.local`; **rotate if exposed**)
- [x] App base URL for dev
- [ ] DHL API credentials (pending approval)

## What We Need to Implement

1. **DHL adapter** – Implement when credentials are available
2. **Supabase Edge Function** – Scheduled sync (replaces external cron)
3. **Telegram notifier** – Wire up real sending (stub exists)
4. **Shipment status detection** – Map DHL statuses to our events
5. **Deduplication** – Use `psa_notifications.message_hash`

## Env Vars for Phase 2

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
APP_BASE_URL=http://localhost:3001
DHL_API_KEY=       # when approved
DHL_API_URL=       # when approved
```
