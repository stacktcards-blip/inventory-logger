-- Server-side aggregation for raw_cards by set_abbr + num (optionally lang)

create or replace function raw_cards_tally(
  p_set_abbr text,
  p_num text,
  p_lang text default null
) returns table (total_qty bigint, avg_price numeric, total_cost numeric, total_cost_aud numeric)
language sql
stable
as $$
  select
    count(*)::bigint as total_qty,
    avg(r.purchase_price) as avg_price,
    sum(r.purchase_price) as total_cost,
    sum (
      case
        when r.purchase_price is not null and r.exchange_rate is not null
        then r.purchase_price * r.exchange_rate
        else null
      end
    ) as total_cost_aud
  from raw_cards r
  where lower(r.set_abbr) = lower(p_set_abbr)
    and lower(r.num) = lower(p_num)
    and (p_lang is null or lower(r.lang) = lower(p_lang));
$$;
