-- Update commit_purchase_source to set currency on insert (AUD when exchange_rate null/1, else JPY)

create or replace function commit_purchase_source(
  p_source_id uuid,
  p_committed_by text,
  p_commit_hash text,
  p_raw_cards jsonb
) returns void
language plpgsql
as $$
begin
  insert into purchase_commits (purchase_source_id, committed_by, commit_hash)
  values (p_source_id, p_committed_by, p_commit_hash);

  insert into raw_cards (
    is_1ed,
    is_rev,
    purchase_price,
    exchange_rate,
    currency,
    purchase_date,
    cond,
    set_abbr,
    num,
    lang,
    seller,
    note
  )
  select
    is_1ed,
    is_rev,
    purchase_price,
    exchange_rate,
    case when exchange_rate is null or exchange_rate = 1 then 'AUD' else 'JPY' end,
    purchase_date,
    cond,
    set_abbr,
    num,
    lang,
    seller,
    note
  from jsonb_to_recordset(p_raw_cards) as x(
    is_1ed boolean,
    is_rev boolean,
    purchase_price numeric,
    exchange_rate numeric,
    purchase_date date,
    cond text,
    set_abbr text,
    num text,
    lang text,
    seller text,
    note text
  );

  update purchase_sources
  set parse_status = 'committed'
  where id = p_source_id;
end;
$$;
