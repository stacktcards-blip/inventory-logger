-- Add archived_at to psa_orders for archiving delivered orders
alter table psa_tracker.psa_orders add column if not exists archived_at timestamptz;
create index if not exists idx_psa_orders_archived_at on psa_tracker.psa_orders(archived_at);
