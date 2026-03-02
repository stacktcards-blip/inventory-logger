# PSA Order Tracker / Grading Order Viewer – Phased Architecture

## Phase 0: Repo Setup & Foundation (MVP prerequisite)

- **Create `psa-tracker/` Next.js app** – App Router, TypeScript, Tailwind; monorepo sibling to existing `frontend/` Slabs UI.
- **Supabase connectivity** – Use `@supabase/supabase-js` for all DB access; same Supabase instance as Slabs Inventory.
- **Auth** – Supabase Auth (email/password or magic link); protect pages and API routes via middleware/session checks.
- **Core schema** – New namespaced tables: `psa_orders`, `psa_order_cards`, `psa_order_events`, `psa_notifications`; SQL migrations in `migrations/`.
- **RLS policies** – Authenticated users can CRUD PSA tracker tables; no public access.

---

## Phase 1: MVP (Orders + Sync + Manual Entry)

- **Orders list page** – Table with filters: status, shipped/not shipped, delivered, exception; sort by date.
- **Order detail page** – PSA info + list of cards in the order; link to sync and edit.
- **CRUD** – Create order (order number, submission date, notes); add cards manually (card_name, set_abbr, card_number, lang, quantity, declared_value).
- **Optional CSV import** – Import cards from CSV if low effort.
- **PSA Sync** – Mock PSA adapter (fixtures) behind interface; real `psa.provider.ts` stub for later. Sync stores status, last_psa_sync_at; idempotent.
- **“Sync now” button** – UI triggers sync for one order via `POST /api/orders/:id/sync`.
- **Cron endpoint** – `POST /api/sync/all` protected by `CRON_SECRET`; external scheduler calls it (e.g. every 6h).
- **Tracking capture** – When PSA status indicates shipped, capture tracking_number; if PSA API doesn’t provide it, email parser stub extracts via regex.
- **Email parser CLI** – `pnpm run parse-email` to test parsing with sample email bodies.

---

## Phase 2: Shipping + Notifications (Post-MVP)

**Decisions (confirmed):**
- **Shipping API** – DHL Shipment Tracking - Unified (pull API); no AfterShip.
- **Cron** – Supabase Edge Function (scheduled), not external VPS cron.
- **DHL poll interval** – Every 6 hours.
- **Notification events** – Only send Telegram for: out for delivery, delivered/ready for collection, exceptions (customs, failed delivery).

- **Shipment monitoring** – DHL adapter behind interface; poll for status every 6h; store last_ship_sync_at.
- **Telegram notifications** – Send only for the events above; dedupe via `psa_notifications.message_hash`.
- **Deep link** – Telegram messages include link to order (APP_BASE_URL, e.g. localhost:3001 for dev).
- **Per-order toggle** – `notifications_enabled` on `psa_orders`; respect when sending.
- **Audit trail** – `psa_order_events` records status changes; `psa_notifications` records sent messages.

---

## Phase 3: Cross-Reference with Slabs Inventory (Post-MVP)

- **Adapter + config** – Schema-agnostic adapter; mapping config (JSON) for table/column names; accepts card identity (cert_number, psa_order_number, set_abbr, card_number, lang, card_name, sku).
- **Read-only** – Adapter returns slab matches (slab_id, sku, cert, grade, location); no writes to slabs tables.
- **Infer schema** – Use existing Slabs Inventory UI codebase (`frontend/`, migrations) to derive: `slabs` (id, sku, cert, order_number, set_abbr, num, lang, grading_order_id), `master_cards` (card_name).
- **Matching strategy** – Match by cert_number, order_number, set_abbr+num+lang; configurable via mapping file.
- **UI** – “Matched slab(s)” section on order card rows; link to Slabs Inventory UI if route known.

---

## Tech Stack Rationale

| Choice | Reason |
|--------|--------|
| Next.js App Router | SSR/API colocation, middleware for auth, simple deployment |
| supabase-js | Single client for auth + DB; RLS enforced; no extra Postgres driver |
| API routes in Next.js | One codebase; no separate Node service for MVP |
| Supabase Edge Function (Phase 2) | Scheduled cron for sync; no VPS needed |
| Zod | Type-safe validation on API boundaries |
| DHL Shipment Tracking - Unified | Pull API; poll every 6h; cost-effective vs AfterShip |

---

## Constraints

- **Idempotent sync** – No duplicate events or notification spam on re-runs.
- **Rate limiting** – Store `last_*_sync_at`; skip re-check if within configured interval.
- **Manual override** – Tracking number etc. editable; not overwritten unless explicitly allowed.
- **Secrets** – All in env vars; never committed.
