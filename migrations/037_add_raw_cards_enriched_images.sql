-- Add card reference image URLs to raw card inventory view.
--
-- The live DB already had raw_cards.gst_relevant/raw_cards.lot_label and
-- tcgdex_image_cache, but these objects were not represented in this repo's
-- migration history. Keep this migration self-contained so a fresh database can
-- replay migrations successfully while the live DB remains unchanged.

alter table raw_cards
  add column if not exists gst_relevant boolean,
  add column if not exists lot_label text;

create table if not exists tcgdex_image_cache (
  id bigserial primary key,
  provider text,
  set_abbr text not null,
  card_num text not null,
  lang text not null,
  image_url text,
  image_small_url text,
  resolved_card_id text,
  resolved_set_id text,
  resolved_api_lang text,
  response_json jsonb,
  fetched_at timestamptz,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tcgdex_image_cache_lookup_lower
on tcgdex_image_cache (
  lower(set_abbr),
  lower(card_num),
  lower(lang)
);

-- Drop/recreate instead of CREATE OR REPLACE because previous repo migrations
-- define raw_cards_enriched without gst_relevant/lot_label/image columns. Postgres
-- requires CREATE OR REPLACE VIEW to preserve existing column order.
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
  r.gst_relevant,
  r.lot_label,
  r.seller,
  r.purchase_date,
  r.note,
  mc.card_name,
  mc.rrty,
  mc.rarity,
  img.image_url,
  img.image_small_url
from raw_cards r
left join master_cards mc
  on lower(mc.set_abbr) = lower(r.set_abbr)
  and lower(mc.num) = lower(r.num)
  and lower(mc.lang) = lower(r.lang)
left join tcgdex_image_cache img
  on lower(img.set_abbr) = lower(r.set_abbr)
  and lower(img.card_num) = lower(r.num)
  and lower(img.lang) = lower(r.lang);
