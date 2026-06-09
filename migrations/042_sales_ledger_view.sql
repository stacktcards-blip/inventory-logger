-- Sales ledger view: enrich ebay_sales rows with slab + raw-card cost context.
-- Adds supporting numeric columns for channel + shipping to support future fee data.

alter table ebay_sales
  add column if not exists sales_channel text not null default 'EBAY',
  add column if not exists shipping_cost numeric,
  add column if not exists order_total numeric,
  add column if not exists order_currency text;

create index if not exists idx_ebay_sales_channel on ebay_sales(sales_channel);

-- Ensure deterministic view definition by recreating.
drop view if exists sales_ledger;

create view sales_ledger as
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
  bs.slab_id,
  bs.image_url,
  bs.created_at,
  bs.updated_at,
  s.cert as slab_cert,
  s.grade as slab_grade,
  s.grading_company as slab_grading_company,
  s.set_abbr as slab_set_abbr,
  s.num as slab_num,
  s.lang as slab_lang,
  s.listing_state,
  s.sale_price as slab_recorded_sale_price,
  s.sale_currency as slab_sale_currency,
  s.sold_date as slab_sold_date,
  s.raw_card_id,
  r.purchase_price as raw_purchase_price,
  r.currency as raw_purchase_currency,
  r.exchange_rate as raw_exchange_rate,
  r.purchase_date as raw_purchase_date,
  r.seller as raw_seller,
  case
    when r.purchase_price is not null and r.exchange_rate is not null
      then round(r.purchase_price * r.exchange_rate, 2)
    else null::numeric
  end as raw_cost_aud,
  case
    when bs.sale_price is not null and r.purchase_price is not null and r.exchange_rate is not null
      then round(bs.sale_price - (r.purchase_price * r.exchange_rate), 2)
    else null::numeric
  end as gross_profit_aud,
  case
    when bs.sold_date is not null and r.purchase_date is not null
      then (bs.sold_date::date - r.purchase_date::date)
    else null::integer
  end as days_held
from base_sales bs
left join slabs s on s.id = bs.slab_id
left join raw_cards r on r.id = s.raw_card_id;

revoke all on sales_ledger from anon;
revoke all on sales_ledger from authenticated;

grant select on sales_ledger to authenticated;
