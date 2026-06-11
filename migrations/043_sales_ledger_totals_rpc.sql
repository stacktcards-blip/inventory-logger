-- Summarize sales_ledger totals for the backend API without relying on
-- PostgREST aggregate select syntax, which is disabled in the hosted API.

create or replace function sales_ledger_totals(
  p_start_date text default null,
  p_end_date text default null,
  p_match_status text default null,
  p_fulfillment_status text default null,
  p_search text default null
)
returns table (
  gross numeric,
  cost numeric,
  profit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(sl.sale_price), 0)::numeric as gross,
    coalesce(sum(sl.raw_cost_aud), 0)::numeric as cost,
    coalesce(sum(sl.gross_profit_aud), 0)::numeric as profit
  from sales_ledger sl
  where (nullif(trim(p_start_date), '') is null or sl.sold_date >= nullif(trim(p_start_date), '')::timestamptz)
    and (nullif(trim(p_end_date), '') is null or sl.sold_date <= nullif(trim(p_end_date), '')::timestamptz)
    and (nullif(trim(p_match_status), '') is null or sl.match_status = nullif(trim(p_match_status), ''))
    and (nullif(trim(p_fulfillment_status), '') is null or sl.fulfillment_status = nullif(trim(p_fulfillment_status), ''))
    and (
      nullif(trim(p_search), '') is null
      or sl.title ilike '%' || nullif(trim(p_search), '') || '%'
      or sl.slab_cert ilike '%' || nullif(trim(p_search), '') || '%'
      or sl.slab_set_abbr ilike '%' || nullif(trim(p_search), '') || '%'
      or sl.slab_num ilike '%' || nullif(trim(p_search), '') || '%'
    );
$$;

revoke all on function sales_ledger_totals(text, text, text, text, text) from public;
grant execute on function sales_ledger_totals(text, text, text, text, text) to authenticated;
grant execute on function sales_ledger_totals(text, text, text, text, text) to service_role;
