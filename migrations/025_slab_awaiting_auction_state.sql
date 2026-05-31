-- Add an explicit slab listing state so physical stocktake can distinguish
-- listed eBay stock from stock that is on hand but waiting for a future auction.
-- This does not mark anything sold; sold_date remains the source of SOLD truth.

alter table slabs
  add column if not exists listing_state text;

alter table slabs
  drop constraint if exists slabs_listing_state_check;

alter table slabs
  add constraint slabs_listing_state_check
  check (listing_state is null or listing_state in ('LISTED', 'AWAITING_AUCTION', 'NOT_LISTED'));

create index if not exists idx_slabs_listing_state on slabs(listing_state);

-- Seed listing_state from the two stocktake scan lists imported on 2026-05-31.
-- Scan1 = physically present and listed on eBay.
-- Scan2 = physically present, not currently listed, waiting for future auction.
-- Do not override sold slabs; those remain exceptions to review.
update slabs s
set listing_state = 'LISTED'
from slab_stocktake_scans scan
where scan.matched_slab_id = s.id
  and scan.location_hint = 'listed_on_ebay'
  and s.sold_date is null;

update slabs s
set listing_state = 'AWAITING_AUCTION'
from slab_stocktake_scans scan
where scan.matched_slab_id = s.id
  and scan.location_hint = 'awaiting_auction'
  and s.sold_date is null;

-- Keep legacy date-derived behaviour, but let explicit listing_state represent
-- the new Awaiting Auction lane. SOLD still wins over every other state.
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
  case
    when s.order_number is null and s.acquired_date is not null then 'PURCHASED_SLAB'::text
    when s.order_number is not null then 'GRADED_BY_US'::text
    else 'UNKNOWN'::text
  end as slab_origin,
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
