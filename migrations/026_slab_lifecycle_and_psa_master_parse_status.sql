-- Slab lifecycle + PSA metadata parse/master-card validation fields.
-- Purpose:
--   1) keep current listing/stock state separate from historical sold/listed dates;
--   2) let PSA metadata be converted into Stackt's strict query format only when
--      set_abbr + num + lang matches master_cards and the card name confirms.
--
-- Safe to run after 024_psa_staging_and_slab_stocktake.sql and
-- 025_slab_awaiting_auction_state.sql. This migration does not bulk-promote slabs.

alter table slabs
  add column if not exists acquisition_type text,
  add column if not exists metadata_status text,
  add column if not exists stock_source text,
  add column if not exists variant text,
  add column if not exists psa_label_details text,
  add column if not exists source_psa_row_id uuid references psa_grading_order_rows(id),
  add column if not exists source_stocktake_scan_id uuid references slab_stocktake_scans(id),
  add column if not exists restocked_at timestamptz,
  add column if not exists restock_reason text;

alter table slabs
  drop constraint if exists slabs_acquisition_type_check;
alter table slabs
  add constraint slabs_acquisition_type_check
  check (acquisition_type is null or acquisition_type in ('GRADED_BY_US', 'PURCHASED_GRADED', 'CONSIGNMENT', 'UNKNOWN'));

alter table slabs
  drop constraint if exists slabs_metadata_status_check;
alter table slabs
  add constraint slabs_metadata_status_check
  check (metadata_status is null or metadata_status in ('PARSED_CONFIRMED', 'NEEDS_ENRICHMENT', 'NEEDS_REVIEW', 'PSA_METADATA_ONLY'));

alter table slabs
  drop constraint if exists slabs_stock_source_check;
alter table slabs
  add constraint slabs_stock_source_check
  check (stock_source is null or stock_source in ('PHYSICAL_STOCKTAKE', 'PSA_STAGING', 'MANUAL', 'UNKNOWN'));

create index if not exists idx_slabs_acquisition_type on slabs(acquisition_type);
create index if not exists idx_slabs_metadata_status on slabs(metadata_status);
create index if not exists idx_slabs_stock_source on slabs(stock_source);
create index if not exists idx_slabs_source_psa_row_id on slabs(source_psa_row_id);
create index if not exists idx_slabs_source_stocktake_scan_id on slabs(source_stocktake_scan_id);
create unique index if not exists idx_slabs_source_stocktake_scan_id_unique
  on slabs(source_stocktake_scan_id)
  where source_stocktake_scan_id is not null;
-- Existing production data may contain duplicate PSA cert rows; keep this non-unique
-- for now and let promotion scripts skip existing certs conservatively.
create index if not exists idx_slabs_psa_cert
  on slabs(cert)
  where grading_company = 'PSA' and cert is not null;

alter table psa_grading_order_rows
  add column if not exists parsed_set_abbr text,
  add column if not exists parsed_num text,
  add column if not exists parsed_lang text,
  add column if not exists matched_master_card_id integer references master_cards(id),
  add column if not exists master_card_match_status text,
  add column if not exists parse_review_reason text,
  add column if not exists psa_label_extra_details text,
  add column if not exists parsed_at timestamptz;

alter table psa_grading_order_rows
  drop constraint if exists psa_grading_order_rows_master_card_match_status_check;
alter table psa_grading_order_rows
  add constraint psa_grading_order_rows_master_card_match_status_check
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

create index if not exists idx_psa_grading_order_rows_parsed_key
  on psa_grading_order_rows(parsed_set_abbr, parsed_num, parsed_lang);
create index if not exists idx_psa_grading_order_rows_master_match_status
  on psa_grading_order_rows(master_card_match_status);
create index if not exists idx_psa_grading_order_rows_matched_master_card_id
  on psa_grading_order_rows(matched_master_card_id);

-- Recreate dashboard so the app can filter/report the new states once columns exist.
drop view if exists slabs_dashboard;

create view slabs_dashboard as
select
  s.id,
  s.sku,
  s.grading_order_id,
  s.cert,
  s.grading_company,
  s.grade,
  s.set_abbr,
  s.num,
  s.lang,
  s.is_1ed,
  s.is_rev,
  mc.card_name,
  mc.rrty,
  mc.rarity,
  mc.set_num,
  s.order_number,
  s.submission_date,
  s.acquired_date,
  s.listed_date,
  s.sold_date,
  s.sale_price,
  s.sale_currency,
  s.ebay_sale_id,
  s.listing_state,
  s.acquisition_type,
  s.metadata_status,
  s.stock_source,
  s.variant,
  s.psa_label_details,
  s.source_psa_row_id,
  s.source_stocktake_scan_id,
  s.restocked_at,
  s.restock_reason,
  s.raw_card_id,
  r.purchase_date as raw_purchase_date,
  r.seller as raw_seller,
  case
    when r.purchase_price is not null and r.exchange_rate is not null
    then round(r.purchase_price * r.exchange_rate, 2)
    else null::numeric
  end as raw_cost_aud,
  case
    when s.sold_date is not null then 'SOLD'::text
    when s.listing_state = 'AWAITING_AUCTION' then 'AWAITING AUCTION'::text
    when s.listing_state = 'LISTED' then 'LISTED'::text
    when s.listed_date is not null then 'LISTED'::text
    else 'NOT LISTED'::text
  end as sales_status,
  coalesce(
    s.acquisition_type,
    case
      when s.order_number is null and s.acquired_date is not null then 'PURCHASED_GRADED'::text
      when s.order_number is not null then 'GRADED_BY_US'::text
      else 'UNKNOWN'::text
    end
  ) as slab_origin,
  case
    when s.raw_card_id is not null then true
    else false
  end as is_linked_to_raw
from slabs s
left join master_cards mc
  on lower(mc.set_abbr) = lower(s.set_abbr)
  and lower(mc.num) = lower(s.num)
  and lower(mc.lang) = lower(s.lang)
left join raw_cards r on r.id = s.raw_card_id;
