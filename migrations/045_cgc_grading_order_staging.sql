-- CGC grading order staging foundation.
-- Mirrors PSA staging enough to ingest CGC order exports, normalize CGC grade labels,
-- parse proposed master-card keys, and later attach CGC metadata to the slab reconciliation cockpit.

create table if not exists cgc_grading_order_rows (
  id uuid primary key default gen_random_uuid(),
  cgc_order_number text,
  cert_number text not null,
  item_type text,
  description text,
  grade text,
  numeric_grade numeric,
  normalized_grade text,
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
  parsed_set_abbr text,
  parsed_num text,
  parsed_lang text,
  matched_master_card_id integer references master_cards(id),
  master_card_match_status text,
  parse_review_reason text,
  cgc_label_extra_details text,
  parsed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cert_number)
);

alter table cgc_grading_order_rows
  drop constraint if exists cgc_grading_order_rows_master_card_match_status_check;
alter table cgc_grading_order_rows
  add constraint cgc_grading_order_rows_master_card_match_status_check
  check (
    master_card_match_status is null or master_card_match_status in (
      'PENDING',
      'MATCHED_CONFIRMED',
      'CARD_NAME_MISMATCH',
      'NO_MASTER_CARD',
      'AMBIGUOUS_MASTER_CARD',
      'PARSE_INCOMPLETE',
      'NON_POKEMON'
    )
  );

create index if not exists idx_cgc_grading_order_rows_order_number on cgc_grading_order_rows(cgc_order_number);
create index if not exists idx_cgc_grading_order_rows_cert_number on cgc_grading_order_rows(cert_number);
create index if not exists idx_cgc_grading_order_rows_item_type on cgc_grading_order_rows(item_type);
create index if not exists idx_cgc_grading_order_rows_grade on cgc_grading_order_rows(grade);
create index if not exists idx_cgc_grading_order_rows_normalized_grade on cgc_grading_order_rows(normalized_grade);
create index if not exists idx_cgc_grading_order_rows_card_number on cgc_grading_order_rows(card_number);
create index if not exists idx_cgc_grading_order_rows_parsed_key on cgc_grading_order_rows(parsed_set_abbr, parsed_num, parsed_lang);
create index if not exists idx_cgc_grading_order_rows_master_match_status on cgc_grading_order_rows(master_card_match_status);
create index if not exists idx_cgc_grading_order_rows_matched_master_card_id on cgc_grading_order_rows(matched_master_card_id);
create index if not exists idx_cgc_grading_order_rows_card_name
  on cgc_grading_order_rows using gin(to_tsvector('simple', coalesce(card_name, '') || ' ' || coalesce(description, '')));

alter table slab_stocktake_scans
  add column if not exists matched_cgc_row_id uuid references cgc_grading_order_rows(id);

create index if not exists idx_slab_stocktake_scans_cgc_row on slab_stocktake_scans(matched_cgc_row_id);

alter table slabs
  add column if not exists source_cgc_row_id uuid references cgc_grading_order_rows(id);

create index if not exists idx_slabs_source_cgc_row_id on slabs(source_cgc_row_id);
create index if not exists idx_slabs_cgc_cert
  on slabs(cert)
  where grading_company = 'CGC' and cert is not null;

alter table slabs
  drop constraint if exists slabs_stock_source_check;
alter table slabs
  add constraint slabs_stock_source_check
  check (stock_source is null or stock_source in ('PHYSICAL_STOCKTAKE', 'PSA_STAGING', 'CGC_STAGING', 'MANUAL', 'UNKNOWN'));

-- Include CGC staging metadata in the existing stocktake reconciliation view while
-- preserving PSA column names for current frontend compatibility. PostgreSQL cannot
-- insert columns into an existing view via CREATE OR REPLACE, so drop/recreate it.
drop view if exists slab_stocktake_reconciliation;
create view slab_stocktake_reconciliation as
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
  cgc.id as cgc_row_id,
  cgc.cgc_order_number,
  cgc.item_type as cgc_item_type,
  cgc.description as cgc_description,
  cgc.grade as cgc_grade,
  cgc.numeric_grade as cgc_numeric_grade,
  cgc.normalized_grade as cgc_normalized_grade,
  cgc.card_name as cgc_card_name,
  cgc.set_name as cgc_set_name,
  cgc.card_number as cgc_card_number,
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
    when cgc.id is not null then 'matched CGC staging only'
    else 'not found in grading staging or slabs'
  end as reconciliation_summary
from slab_stocktake_scans scan
left join psa_grading_order_rows psa on psa.id = scan.matched_psa_row_id
left join cgc_grading_order_rows cgc on cgc.id = scan.matched_cgc_row_id
left join slabs slab on slab.id = scan.matched_slab_id;

drop trigger if exists cgc_grading_order_rows_updated_at on cgc_grading_order_rows;
create trigger cgc_grading_order_rows_updated_at
  before update on cgc_grading_order_rows
  for each row execute function graded_reconciliation_updated_at();

alter table cgc_grading_order_rows enable row level security;

create policy "Authenticated users can select CGC grading order rows"
  on cgc_grading_order_rows for select to authenticated using (true);
create policy "Authenticated users can insert CGC grading order rows"
  on cgc_grading_order_rows for insert to authenticated with check (true);
create policy "Authenticated users can update CGC grading order rows"
  on cgc_grading_order_rows for update to authenticated using (true);

comment on table cgc_grading_order_rows is
  'CGC grading-order staging rows keyed by cert. Historical metadata only; physical stocktake scans remain source of on-hand truth.';
comment on column cgc_grading_order_rows.normalized_grade is
  'Stackt-normalized CGC grade: Pristine 10 -> 10+, Gem Mint 10 -> 10, Mint 9.5 -> 9.5, etc.';
