-- Add grading_order_id to slabs_dashboard for Phase 4 grading order filter

drop view if exists slabs_enriched;
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
  s.raw_card_id,
  r.purchase_date as raw_purchase_date,
  r.seller as raw_seller,
  case
    when s.sold_date is not null then 'SOLD'::text
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
left join master_cards mc on mc.set_abbr = s.set_abbr and mc.num = s.num and mc.lang = s.lang
left join raw_cards r on r.id = s.raw_card_id;

create view slabs_enriched as
select
  s.id,
  s.sku,
  s.cert,
  s.set_abbr,
  s.num,
  s.lang,
  s.is_1ed,
  s.is_rev,
  s.grading_company,
  s.grade,
  s.note,
  s.order_number,
  s.submission_date,
  s.acquired_date,
  s.listed_date,
  s.sold_date,
  s.grading_order_id,
  s.raw_card_id,
  mc.card_name,
  mc.rrty,
  mc.rarity,
  r.purchase_date as raw_purchase_date,
  r.seller as raw_seller,
  r.purchase_price,
  r.exchange_rate,
  case
    when r.purchase_price is not null and r.exchange_rate is not null
    then round(r.purchase_price * r.exchange_rate, 2)
    else null::numeric
  end as raw_cost_aud
from slabs s
left join master_cards mc on mc.set_abbr = s.set_abbr and mc.num = s.num and mc.lang = s.lang
left join raw_cards r on r.id = s.raw_card_id;
