-- Update raw_cards_tally to return JPY and AUD tallies separately

drop function if exists raw_cards_tally(text, text, text);

create or replace function raw_cards_tally(
  p_set_abbr text,
  p_num text,
  p_lang text default null
) returns table (
  total_qty bigint,
  total_qty_jpy bigint,
  avg_price_jpy numeric,
  total_cost_jpy numeric,
  total_qty_aud bigint,
  avg_price_aud numeric,
  total_cost_aud numeric
)
language sql
stable
as $$
  with base as (
    select
      r.purchase_price,
      r.exchange_rate,
      coalesce(r.currency,
        case when r.exchange_rate is null or r.exchange_rate = 1 then 'AUD' else 'JPY' end
      ) as currency
    from raw_cards r
    where lower(r.set_abbr) = lower(p_set_abbr)
      and lower(r.num) = lower(p_num)
      and (p_lang is null or lower(r.lang) = lower(p_lang))
  ),
  jpy as (
    select
      count(*)::bigint as qty,
      avg(purchase_price) as avg_p,
      sum(purchase_price) as total
    from base
    where currency = 'JPY'
  ),
  aud as (
    select
      count(*)::bigint as qty,
      avg(purchase_price) as avg_p,
      sum(purchase_price) as total
    from base
    where currency = 'AUD'
  )
  select
    (select count(*)::bigint from base) as total_qty,
    (select qty from jpy) as total_qty_jpy,
    (select avg_p from jpy) as avg_price_jpy,
    (select total from jpy) as total_cost_jpy,
    (select qty from aud) as total_qty_aud,
    (select avg_p from aud) as avg_price_aud,
    (select total from aud) as total_cost_aud;
$$;
