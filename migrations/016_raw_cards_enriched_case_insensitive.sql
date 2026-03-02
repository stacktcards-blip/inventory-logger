-- Make raw_cards_enriched master_cards lookup case-insensitive (consistent with slabs)

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
