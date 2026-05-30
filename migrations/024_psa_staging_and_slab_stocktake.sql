-- PSA grading order staging + slab stocktake/reconciliation foundation.
-- PSA order CSVs are historical metadata, not proof of current stock.
-- Physical stocktake scans are the source of on-hand truth and can be reconciled against this staging data and existing slabs.

create table if not exists psa_grading_order_rows (
  id uuid primary key default gen_random_uuid(),
  psa_order_number text not null,
  cert_number text not null,
  item_type text,
  description text,
  grade text,
  numeric_grade numeric,
  after_service text,
  image_url text,
  year text,
  brand text,
  language_or_release text,
  set_code text,
  set_name text,
  card_number text,
  card_name text,
  variety text,
  raw_row_json jsonb,
  import_batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cert_number)
);

create index if not exists idx_psa_grading_order_rows_order_number on psa_grading_order_rows(psa_order_number);
create index if not exists idx_psa_grading_order_rows_item_type on psa_grading_order_rows(item_type);
create index if not exists idx_psa_grading_order_rows_grade on psa_grading_order_rows(grade);
create index if not exists idx_psa_grading_order_rows_card_number on psa_grading_order_rows(card_number);
create index if not exists idx_psa_grading_order_rows_card_name on psa_grading_order_rows using gin(to_tsvector('simple', coalesce(card_name, '') || ' ' || coalesce(description, '')));

create table if not exists slab_stocktake_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grader text,
  location_hint text,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_slab_stocktake_sessions_started_at on slab_stocktake_sessions(started_at desc);
create index if not exists idx_slab_stocktake_sessions_status on slab_stocktake_sessions(status);

create table if not exists slab_stocktake_scans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references slab_stocktake_sessions(id) on delete cascade,
  raw_scan_text text not null,
  grader text not null default 'PSA',
  cert_number text not null,
  matched_psa_row_id uuid references psa_grading_order_rows(id),
  matched_slab_id uuid references slabs(id),
  scan_status text not null default 'new_cert'
    check (scan_status in ('matched_existing_slab', 'matched_psa_only', 'new_cert', 'duplicate_in_session', 'sold_but_seen', 'needs_review', 'ignored')),
  location_hint text,
  notes text,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_slab_stocktake_scans_session_cert
  on slab_stocktake_scans(session_id, grader, cert_number)
  where scan_status <> 'ignored';
create index if not exists idx_slab_stocktake_scans_cert on slab_stocktake_scans(grader, cert_number);
create index if not exists idx_slab_stocktake_scans_session on slab_stocktake_scans(session_id);
create index if not exists idx_slab_stocktake_scans_status on slab_stocktake_scans(scan_status);
create index if not exists idx_slab_stocktake_scans_psa_row on slab_stocktake_scans(matched_psa_row_id);
create index if not exists idx_slab_stocktake_scans_slab on slab_stocktake_scans(matched_slab_id);

create or replace view slab_stocktake_reconciliation as
select
  scan.id as scan_id,
  scan.session_id,
  scan.grader,
  scan.cert_number,
  scan.scan_status,
  scan.location_hint,
  scan.scanned_at,
  psa.id as psa_row_id,
  psa.psa_order_number,
  psa.item_type,
  psa.description as psa_description,
  psa.grade as psa_grade,
  psa.numeric_grade as psa_numeric_grade,
  psa.card_name as psa_card_name,
  psa.set_name as psa_set_name,
  psa.card_number as psa_card_number,
  slab.id as slab_id,
  slab.cert as slab_cert,
  slab.grading_company as slab_grading_company,
  slab.grade as slab_grade,
  slab.set_abbr as slab_set_abbr,
  slab.num as slab_num,
  slab.lang as slab_lang,
  slab.sold_date,
  slab.listed_date,
  case
    when scan.scan_status = 'duplicate_in_session' then 'duplicate scan in this stocktake'
    when slab.id is not null and slab.sold_date is not null then 'sold in slabs but physically scanned'
    when slab.id is not null then 'matched existing slab'
    when psa.id is not null then 'matched PSA staging only'
    else 'not found in PSA staging or slabs'
  end as reconciliation_summary
from slab_stocktake_scans scan
left join psa_grading_order_rows psa on psa.id = scan.matched_psa_row_id
left join slabs slab on slab.id = scan.matched_slab_id;

create or replace function graded_reconciliation_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists psa_grading_order_rows_updated_at on psa_grading_order_rows;
create trigger psa_grading_order_rows_updated_at
  before update on psa_grading_order_rows
  for each row execute function graded_reconciliation_updated_at();

drop trigger if exists slab_stocktake_sessions_updated_at on slab_stocktake_sessions;
create trigger slab_stocktake_sessions_updated_at
  before update on slab_stocktake_sessions
  for each row execute function graded_reconciliation_updated_at();

drop trigger if exists slab_stocktake_scans_updated_at on slab_stocktake_scans;
create trigger slab_stocktake_scans_updated_at
  before update on slab_stocktake_scans
  for each row execute function graded_reconciliation_updated_at();

alter table psa_grading_order_rows enable row level security;
alter table slab_stocktake_sessions enable row level security;
alter table slab_stocktake_scans enable row level security;

create policy "Authenticated users can select PSA grading order rows"
  on psa_grading_order_rows for select to authenticated using (true);
create policy "Authenticated users can insert PSA grading order rows"
  on psa_grading_order_rows for insert to authenticated with check (true);
create policy "Authenticated users can update PSA grading order rows"
  on psa_grading_order_rows for update to authenticated using (true);

create policy "Authenticated users can select slab stocktake sessions"
  on slab_stocktake_sessions for select to authenticated using (true);
create policy "Authenticated users can insert slab stocktake sessions"
  on slab_stocktake_sessions for insert to authenticated with check (true);
create policy "Authenticated users can update slab stocktake sessions"
  on slab_stocktake_sessions for update to authenticated using (true);

create policy "Authenticated users can select slab stocktake scans"
  on slab_stocktake_scans for select to authenticated using (true);
create policy "Authenticated users can insert slab stocktake scans"
  on slab_stocktake_scans for insert to authenticated with check (true);
create policy "Authenticated users can update slab stocktake scans"
  on slab_stocktake_scans for update to authenticated using (true);
