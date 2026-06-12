-- Refresh slabs_dashboard to expose source_cgc_row_id for CGC staging joins.

set check_function_bodies = off;

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
  s.source_cgc_row_id,
  s.source_stocktake_scan_id,
  s.restocked_at,
  s.restock_reason,
  s.raw_card_id,
  r.purchase_date as raw_purchase_date,
  r.seller as raw_seller,
  case
    when r.purchase_price is not null and r.exchange_rate is not null then round(r.purchase_price * r.exchange_rate, 2)
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
  case when s.raw_card_id is not null then true else false end as is_linked_to_raw
from slabs s
left join master_cards mc
  on lower(mc.set_abbr) = lower(s.set_abbr)
  and lower(mc.num) = lower(s.num)
  and lower(mc.lang) = lower(s.lang)
left join raw_cards r on r.id = s.raw_card_id;
