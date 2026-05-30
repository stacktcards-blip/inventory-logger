-- Sales Packing saved import sessions
-- CSV upload/import history + one row per physical packing/cert-scan item.

create table if not exists sales_packing_imports (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id),
  source_filename text,
  row_count int not null default 0,
  expanded_row_count int not null default 0,
  order_count int not null default 0,
  total_sold_ex_postage numeric not null default 0,
  status text not null default 'imported' check (status in ('imported', 'partially_scanned', 'scanned', 'cancelled')),
  raw_csv_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales_packing_item_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references sales_packing_imports(id) on delete cascade,
  line_item_key text not null,
  sale_date text,
  buyer_username text,
  order_number text,
  sales_record_number text,
  item_number text,
  listing_title text,
  custom_label text,
  quantity int not null default 1,
  sold_for numeric,
  postage_and_handling numeric,
  total_price numeric,
  tracking_number text,
  combined_order boolean not null default false,
  warnings jsonb not null default '[]'::jsonb,
  raw_item_json jsonb,
  created_at timestamptz not null default now(),
  unique(import_id, line_item_key)
);

create table if not exists sales_packing_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references sales_packing_imports(id) on delete cascade,
  line_item_key text not null,
  sale_date text,
  buyer_username text,
  order_number text,
  sales_record_number text,
  item_number text,
  listing_title text,
  custom_label text,
  quantity int not null default 1,
  sold_for numeric,
  postage_and_handling numeric,
  total_price numeric,
  tracking_number text,
  combined_order boolean not null default false,
  warnings jsonb not null default '[]'::jsonb,
  quantity_unit text not null,
  cert_scanned text,
  scan_status text not null default 'pending' check (scan_status in ('pending', 'scanned', 'validated', 'error')),
  removed boolean not null default false,
  removed_reason text,
  validation_flags jsonb not null default '[]'::jsonb,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_packing_imports_uploaded_at on sales_packing_imports(uploaded_at desc);
create index if not exists idx_sales_packing_rows_import_id on sales_packing_rows(import_id);
create index if not exists idx_sales_packing_rows_scan_status on sales_packing_rows(scan_status);
create index if not exists idx_sales_packing_rows_cert_scanned on sales_packing_rows(cert_scanned) where cert_scanned is not null;

alter table sales_packing_imports enable row level security;
alter table sales_packing_item_rows enable row level security;
alter table sales_packing_rows enable row level security;

create policy "Authenticated users can select sales packing imports"
  on sales_packing_imports for select to authenticated using (true);
create policy "Authenticated users can insert sales packing imports"
  on sales_packing_imports for insert to authenticated with check (true);
create policy "Authenticated users can update sales packing imports"
  on sales_packing_imports for update to authenticated using (true);

create policy "Authenticated users can select sales packing item rows"
  on sales_packing_item_rows for select to authenticated using (true);
create policy "Authenticated users can insert sales packing item rows"
  on sales_packing_item_rows for insert to authenticated with check (true);
create policy "Authenticated users can update sales packing item rows"
  on sales_packing_item_rows for update to authenticated using (true);

create policy "Authenticated users can select sales packing rows"
  on sales_packing_rows for select to authenticated using (true);
create policy "Authenticated users can insert sales packing rows"
  on sales_packing_rows for insert to authenticated with check (true);
create policy "Authenticated users can update sales packing rows"
  on sales_packing_rows for update to authenticated using (true);
