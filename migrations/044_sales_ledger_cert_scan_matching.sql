-- Sales Ledger Matching MVP: enrich sales_ledger with read-only Sales Packing cert scans.
-- This does not mutate ebay_sales, slabs, or sales_packing rows.

create index if not exists idx_sales_packing_rows_order_item_active
  on sales_packing_rows(order_number, item_number)
  where removed = false;

create index if not exists idx_sales_packing_rows_item_buyer_active
  on sales_packing_rows(item_number, buyer_username)
  where removed = false;

create index if not exists idx_sales_packing_rows_custom_label_active
  on sales_packing_rows(custom_label, buyer_username)
  where removed = false;

-- Preserve dependent RPCs such as sales_ledger_totals while appending matching fields.
create or replace view sales_ledger as
with base_sales as (
  select
    es.id,
    es.sales_channel,
    es.ebay_order_id,
    es.ebay_line_item_id,
    es.ebay_item_id,
    es.ebay_sku,
    es.title,
    es.quantity,
    es.sale_price,
    es.currency,
    es.shipping_cost,
    es.order_total,
    es.order_currency,
    es.sold_date,
    es.buyer_username,
    es.fulfillment_status,
    es.match_status,
    es.match_method,
    es.parse_confidence,
    es.slab_id,
    es.image_url,
    es.created_at,
    es.updated_at
  from ebay_sales es
), matched_packing as (
  select
    bs.id as sale_id,
    spr.id as packing_row_id,
    spr.import_id as packing_import_id,
    spr.cert_scanned as packing_cert,
    spr.scan_status as packing_scan_status,
    spi.uploaded_at as packing_imported_at,
    case
      when nullif(trim(coalesce(spr.order_number, '')), '') = nullif(trim(coalesce(bs.ebay_order_id, '')), '')
       and nullif(trim(coalesce(spr.item_number, '')), '') = nullif(trim(coalesce(bs.ebay_item_id, '')), '')
        then 'ORDER_ITEM'
      when nullif(trim(coalesce(spr.item_number, '')), '') = nullif(trim(coalesce(bs.ebay_item_id, '')), '')
       and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, '')))
        then 'ITEM_BUYER'
      when nullif(trim(coalesce(spr.custom_label, '')), '') = nullif(trim(coalesce(bs.ebay_sku, '')), '')
       and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, '')))
        then 'SKU_BUYER'
      when lower(trim(coalesce(spr.listing_title, ''))) = lower(trim(coalesce(bs.title, '')))
       and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, '')))
       and (spr.sold_for is null or bs.sale_price is null or abs(spr.sold_for - bs.sale_price) <= 0.01)
        then 'TITLE_BUYER_PRICE'
      else 'UNKNOWN'
    end as packing_match_method,
    case
      when spr.cert_scanned is null or trim(spr.cert_scanned) = '' then 'Matched packing row has no scanned cert yet'
      else null
    end as packing_review_reason,
    row_number() over (
      partition by bs.id
      order by
        case
          when nullif(trim(coalesce(spr.order_number, '')), '') = nullif(trim(coalesce(bs.ebay_order_id, '')), '')
           and nullif(trim(coalesce(spr.item_number, '')), '') = nullif(trim(coalesce(bs.ebay_item_id, '')), '') then 1
          when nullif(trim(coalesce(spr.item_number, '')), '') = nullif(trim(coalesce(bs.ebay_item_id, '')), '')
           and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, ''))) then 2
          when nullif(trim(coalesce(spr.custom_label, '')), '') = nullif(trim(coalesce(bs.ebay_sku, '')), '')
           and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, ''))) then 3
          when lower(trim(coalesce(spr.listing_title, ''))) = lower(trim(coalesce(bs.title, '')))
           and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, '')))
           and (spr.sold_for is null or bs.sale_price is null or abs(spr.sold_for - bs.sale_price) <= 0.01) then 4
          else 9
        end,
        spi.uploaded_at desc nulls last,
        spr.updated_at desc nulls last
    ) as match_rank
  from base_sales bs
  join sales_packing_rows spr on spr.removed = false
   and (
    (
      nullif(trim(coalesce(spr.order_number, '')), '') = nullif(trim(coalesce(bs.ebay_order_id, '')), '')
      and nullif(trim(coalesce(spr.item_number, '')), '') = nullif(trim(coalesce(bs.ebay_item_id, '')), '')
    )
    or (
      nullif(trim(coalesce(spr.item_number, '')), '') = nullif(trim(coalesce(bs.ebay_item_id, '')), '')
      and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, '')))
    )
    or (
      nullif(trim(coalesce(spr.custom_label, '')), '') = nullif(trim(coalesce(bs.ebay_sku, '')), '')
      and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, '')))
    )
    or (
      lower(trim(coalesce(spr.listing_title, ''))) = lower(trim(coalesce(bs.title, '')))
      and lower(trim(coalesce(spr.buyer_username, ''))) = lower(trim(coalesce(bs.buyer_username, '')))
      and (spr.sold_for is null or bs.sale_price is null or abs(spr.sold_for - bs.sale_price) <= 0.01)
    )
   )
  left join sales_packing_imports spi on spi.id = spr.import_id
), best_packing as (
  select * from matched_packing where match_rank = 1
), slab_by_cert as (
  select *
  from (
    select
      s.*,
      regexp_replace(coalesce(s.cert, ''), '[^0-9A-Za-z]', '', 'g') as normalized_cert,
      row_number() over (
        partition by regexp_replace(coalesce(s.cert, ''), '[^0-9A-Za-z]', '', 'g')
        order by s.sold_date desc nulls last, s.listed_date desc nulls last, s.acquired_date desc nulls last, s.id
      ) as cert_rank
    from slabs s
    where nullif(regexp_replace(coalesce(s.cert, ''), '[^0-9A-Za-z]', '', 'g'), '') is not null
  ) ranked_slabs
  where cert_rank = 1
)
select
  bs.id as sale_id,
  bs.sales_channel,
  bs.ebay_order_id,
  bs.ebay_line_item_id,
  bs.ebay_item_id,
  bs.ebay_sku,
  bs.title,
  bs.quantity,
  bs.sale_price,
  bs.currency,
  bs.shipping_cost,
  bs.order_total,
  bs.order_currency,
  bs.sold_date,
  bs.buyer_username,
  bs.fulfillment_status,
  bs.match_status,
  bs.match_method,
  bs.parse_confidence,
  coalesce(bs.slab_id, scan_slab.id) as slab_id,
  bs.image_url,
  bs.created_at,
  bs.updated_at,
  coalesce(direct_slab.cert, scan_slab.cert) as slab_cert,
  coalesce(direct_slab.grade, scan_slab.grade) as slab_grade,
  coalesce(direct_slab.grading_company, scan_slab.grading_company) as slab_grading_company,
  coalesce(direct_slab.set_abbr, scan_slab.set_abbr) as slab_set_abbr,
  coalesce(direct_slab.num, scan_slab.num) as slab_num,
  coalesce(direct_slab.lang, scan_slab.lang) as slab_lang,
  coalesce(direct_slab.listing_state, scan_slab.listing_state) as listing_state,
  coalesce(direct_slab.sale_price, scan_slab.sale_price) as slab_recorded_sale_price,
  coalesce(direct_slab.sale_currency, scan_slab.sale_currency) as slab_sale_currency,
  coalesce(direct_slab.sold_date, scan_slab.sold_date) as slab_sold_date,
  coalesce(direct_slab.raw_card_id, scan_slab.raw_card_id) as raw_card_id,
  raw.purchase_price as raw_purchase_price,
  raw.currency as raw_purchase_currency,
  raw.exchange_rate as raw_exchange_rate,
  raw.purchase_date as raw_purchase_date,
  raw.seller as raw_seller,
  case
    when raw.purchase_price is not null and raw.exchange_rate is not null
      then round(raw.purchase_price * raw.exchange_rate, 2)
    else null::numeric
  end as raw_cost_aud,
  case
    when bs.sale_price is not null and raw.purchase_price is not null and raw.exchange_rate is not null
      then round(bs.sale_price - (raw.purchase_price * raw.exchange_rate), 2)
    else null::numeric
  end as gross_profit_aud,
  case
    when bs.sold_date is not null and raw.purchase_date is not null
      then (bs.sold_date::date - raw.purchase_date::date)
    else null::integer
  end as days_held,
  bp.packing_row_id,
  bp.packing_import_id,
  bp.packing_cert,
  bp.packing_scan_status,
  bp.packing_match_method,
  bp.packing_review_reason,
  bp.packing_imported_at,
  case
    when coalesce(bs.slab_id, scan_slab.id) is not null then 'MATCHED'
    when bp.packing_cert is not null and scan_slab.id is null then 'REVIEW'
    when bp.packing_row_id is not null and (bp.packing_cert is null or trim(bp.packing_cert) = '') then 'REVIEW'
    else 'UNMATCHED'
  end as inventory_match_status,
  case
    when bs.slab_id is not null then 'Matched by ledger slab link'
    when scan_slab.id is not null then 'Matched by cert scan'
    when bp.packing_cert is not null and scan_slab.id is null then 'Scanned cert not in slabs'
    when bp.packing_row_id is not null then 'Packing row awaiting cert scan'
    else 'Unmatched'
  end as inventory_match_label,
  case
    when bs.slab_id is not null then null::text
    when scan_slab.id is not null then null::text
    when bp.packing_cert is not null and scan_slab.id is null then 'Sales Packing cert ' || bp.packing_cert || ' has no slab inventory record'
    when bp.packing_row_id is not null then coalesce(bp.packing_review_reason, 'Sales Packing row matched but cert is blank')
    else 'No Sales Packing cert scan or direct slab link yet'
  end as review_reason
from base_sales bs
left join best_packing bp on bp.sale_id = bs.id
left join slabs direct_slab on direct_slab.id = bs.slab_id
left join slab_by_cert scan_slab on scan_slab.normalized_cert = regexp_replace(coalesce(bp.packing_cert, ''), '[^0-9A-Za-z]', '', 'g')
  and nullif(regexp_replace(coalesce(bp.packing_cert, ''), '[^0-9A-Za-z]', '', 'g'), '') is not null
left join raw_cards raw on raw.id = coalesce(direct_slab.raw_card_id, scan_slab.raw_card_id);

revoke all on sales_ledger from anon;
revoke all on sales_ledger from authenticated;
grant select on sales_ledger to authenticated;
