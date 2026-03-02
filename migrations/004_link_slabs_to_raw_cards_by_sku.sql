-- One-time backfill: link slabs to raw_cards by matching SKU.
-- raw_cards has PK id; slabs.raw_card_id is FK to raw_cards.id (unique: one slab per raw_card).
-- After this migration, use raw_card_id for the relationship; SKU is display-only.
--
-- Note: raw_cards.SKU is uppercase; slabs.sku is lowercase. Match is case-sensitive.
-- When multiple slabs/raw_cards share the same SKU, we match 1:1 by row number within each SKU group.

with slab_ranked as (
  select id, sku, row_number() over (partition by sku order by id) as rn
  from slabs
  where sku is not null and trim(sku) != '' and raw_card_id is null
),
rc_ranked as (
  select id, "SKU" as sku, row_number() over (partition by "SKU" order by id) as rn
  from raw_cards
  where "SKU" is not null and trim("SKU") != ''
    and id not in (select raw_card_id from slabs where raw_card_id is not null)
)
update slabs s
set raw_card_id = r.id
from slab_ranked sr
join rc_ranked r on sr.sku = r.sku and sr.rn = r.rn
where s.id = sr.id;
