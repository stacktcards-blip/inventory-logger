-- Add currency column to raw_cards for GST calculation (AUD vs JPY)

alter table raw_cards add column if not exists currency text;

-- Backfill: exchange_rate null or 1 = AUD (Australia); else JPY (Japan)
update raw_cards
set currency = case
  when exchange_rate is null or exchange_rate = 1 then 'AUD'
  else 'JPY'
end
where currency is null;

-- Recreate raw_cards_enriched to include currency
drop view if exists raw_cards_enriched;

create view raw_cards_enriched as
select
  r.id,
  r.created_at,
  r."SKU",
  r.set_abbr,
  r.num,
  r.lang,
  r.is_1ed,
  r.is_rev,
  r.cond,
  r.purchase_price,
  r.exchange_rate,
  r.currency,
  r.seller,
  r.purchase_date,
  r.note,
  mc.card_name,
  mc.rrty,
  mc.rarity
from raw_cards r
left join master_cards mc
  on lower(mc.set_abbr) = lower(r.set_abbr)
  and lower(mc.num) = lower(r.num)
  and lower(mc.lang) = lower(r.lang);
