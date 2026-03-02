-- eBay Sales Intake: ebay_sales, ebay_sync_log, ebay_refund_requests
-- Per docs/EBAY_SALES_INTAKE_FRAMEWORK.md

-- ebay_sales
create table if not exists ebay_sales (
  id uuid primary key default gen_random_uuid(),
  ebay_order_id text,
  ebay_line_item_id text not null unique,
  ebay_item_id text,
  ebay_sku text,
  title text,
  quantity int not null default 1,
  sale_price numeric,
  currency text default 'AUD',
  sold_date date,
  buyer_username text,
  fulfillment_status text check (fulfillment_status in ('NOT_STARTED', 'IN_PROGRESS', 'FULFILLED')),
  image_url text,
  -- Parsed
  card_name text,
  set_abbr text,
  num text,
  set_num text,
  set_name text,
  lang text default 'ENG',
  grade text,
  grading_company text,
  rarity text,
  card_game text,
  parse_confidence numeric,
  parse_flags jsonb default '[]',
  -- Matching
  slab_id uuid references slabs(id),
  match_method text check (match_method in ('PARSED', 'CERT_SCAN', 'SKU', 'MANUAL')),
  match_status text not null default 'PENDING' check (match_status in ('PENDING', 'MATCHED', 'UNMATCHED', 'MANUAL_REVIEW')),
  matched_at timestamptz,
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_response jsonb
);

create index if not exists idx_ebay_sales_fulfillment_status on ebay_sales(fulfillment_status);
create index if not exists idx_ebay_sales_match_status on ebay_sales(match_status);
create index if not exists idx_ebay_sales_sold_date on ebay_sales(sold_date desc);
create index if not exists idx_ebay_sales_slab_id on ebay_sales(slab_id);

-- ebay_sync_log
create table if not exists ebay_sync_log (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text,
  orders_fetched int default 0,
  sales_created int default 0,
  sales_matched int default 0,
  error_message text
);

-- ebay_refund_requests
create table if not exists ebay_refund_requests (
  id uuid primary key default gen_random_uuid(),
  ebay_sale_id uuid not null references ebay_sales(id) on delete cascade,
  slab_id uuid not null references slabs(id) on delete cascade,
  reason text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists idx_ebay_refund_requests_status on ebay_refund_requests(status);

-- RLS
alter table ebay_sales enable row level security;
alter table ebay_sync_log enable row level security;
alter table ebay_refund_requests enable row level security;

create policy "Authenticated users can select ebay_sales"
  on ebay_sales for select to authenticated using (true);
create policy "Authenticated users can insert ebay_sales"
  on ebay_sales for insert to authenticated with check (true);
create policy "Authenticated users can update ebay_sales"
  on ebay_sales for update to authenticated using (true);

create policy "Authenticated users can select ebay_sync_log"
  on ebay_sync_log for select to authenticated using (true);
create policy "Service role can insert ebay_sync_log"
  on ebay_sync_log for insert to service_role with check (true);

create policy "Authenticated users can select ebay_refund_requests"
  on ebay_refund_requests for select to authenticated using (true);
create policy "Authenticated users can insert ebay_refund_requests"
  on ebay_refund_requests for insert to authenticated with check (true);
create policy "Authenticated users can update ebay_refund_requests"
  on ebay_refund_requests for update to authenticated using (true);
