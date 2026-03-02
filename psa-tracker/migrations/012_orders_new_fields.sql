-- Orders NEW: submission date, estimated arrival, billed amount (for duties highlight)
alter table psa_tracker.psa_orders add column if not exists submission_date date;
alter table psa_tracker.psa_orders add column if not exists estimated_arrival_date date;
alter table psa_tracker.psa_orders add column if not exists billed_amount_usd numeric;
create index if not exists idx_psa_orders_billed_amount on psa_tracker.psa_orders(billed_amount_usd) where billed_amount_usd is not null;
