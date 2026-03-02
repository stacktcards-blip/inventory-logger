-- PSA Order Tracker / Grading Order Viewer
-- Uses psa_tracker schema to avoid conflict with existing public.psa_orders table.
-- All timestamps in UTC.

create schema if not exists psa_tracker;

-- psa_orders
create table if not exists psa_tracker.psa_orders (
  id uuid primary key default gen_random_uuid(),
  psa_order_number text not null unique,
  status text not null default 'unknown',
  status_detail text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  tracking_number text,
  carrier text,
  last_psa_sync_at timestamptz,
  last_ship_sync_at timestamptz,
  notifications_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_psa_orders_status on psa_tracker.psa_orders(status);
create index if not exists idx_psa_orders_shipped_at on psa_tracker.psa_orders(shipped_at);
create index if not exists idx_psa_orders_created_at on psa_tracker.psa_orders(created_at desc);

-- psa_order_cards
create table if not exists psa_tracker.psa_order_cards (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references psa_tracker.psa_orders(id) on delete cascade,
  card_name text not null,
  set_abbr text not null,
  card_number text not null,
  lang text not null default 'EN',
  quantity int not null default 1,
  declared_value numeric,
  grade_result text,
  cert_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_psa_order_cards_order_id on psa_tracker.psa_order_cards(order_id);
create index if not exists idx_psa_order_cards_cert on psa_tracker.psa_order_cards(cert_number) where cert_number is not null;

-- psa_order_events (audit trail)
create table if not exists psa_tracker.psa_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references psa_tracker.psa_orders(id) on delete cascade,
  source text not null check (source in ('psa', 'shipping', 'manual')),
  event_type text not null,
  payload_json jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_psa_order_events_order_id on psa_tracker.psa_order_events(order_id);
create index if not exists idx_psa_order_events_occurred_at on psa_tracker.psa_order_events(occurred_at desc);

-- psa_notifications (dedupe via message_hash)
create table if not exists psa_tracker.psa_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references psa_tracker.psa_orders(id) on delete cascade,
  channel text not null default 'telegram',
  message_hash text not null,
  event_type text not null,
  sent_at timestamptz not null default now(),
  payload_json jsonb
);

create unique index if not exists idx_psa_notifications_dedupe on psa_tracker.psa_notifications(order_id, channel, message_hash);
create index if not exists idx_psa_notifications_order_id on psa_tracker.psa_notifications(order_id);

-- updated_at trigger
create or replace function psa_tracker.psa_tracker_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger psa_orders_updated_at
  before update on psa_tracker.psa_orders
  for each row execute function psa_tracker.psa_tracker_updated_at();

create trigger psa_order_cards_updated_at
  before update on psa_tracker.psa_order_cards
  for each row execute function psa_tracker.psa_tracker_updated_at();
