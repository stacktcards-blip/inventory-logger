-- Normalize raw-card image cache lookups across Stackt language codes and TCGdex language codes.
--
-- Stackt raw/master data commonly stores ENG/JPN while TCGdex uses en/ja. Keep the
-- cache table's original key values for auditability, but make raw_cards_enriched
-- join through a normalized language expression so either form resolves previews.

create index if not exists idx_tcgdex_image_cache_lookup_normalized
on tcgdex_image_cache (
  lower(trim(set_abbr)),
  lower(trim(card_num)),
  (
    case lower(trim(lang))
      when 'eng' then 'en'
      when 'en' then 'en'
      when 'english' then 'en'
      when 'jpn' then 'ja'
      when 'jp' then 'ja'
      when 'ja' then 'ja'
      when 'japanese' then 'ja'
      else lower(trim(lang))
    end
  )
);

-- Drop/recreate instead of CREATE OR REPLACE because this view has changed shape
-- across earlier migrations and we want a complete, deterministic definition.
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
left join lateral (
  select cache.image_url, cache.image_small_url
  from tcgdex_image_cache cache
  where lower(trim(cache.set_abbr)) = lower(trim(r.set_abbr))
    and lower(trim(cache.card_num)) = lower(trim(r.num))
    and (
      case lower(trim(cache.lang))
        when 'eng' then 'en'
        when 'en' then 'en'
        when 'english' then 'en'
        when 'jpn' then 'ja'
        when 'jp' then 'ja'
        when 'ja' then 'ja'
        when 'japanese' then 'ja'
        else lower(trim(cache.lang))
      end
    ) = (
      case lower(trim(r.lang))
        when 'eng' then 'en'
        when 'en' then 'en'
        when 'english' then 'en'
        when 'jpn' then 'ja'
        when 'jp' then 'ja'
        when 'ja' then 'ja'
        when 'japanese' then 'ja'
        else lower(trim(r.lang))
      end
    )
  order by (cache.image_url is not null or cache.image_small_url is not null) desc,
           cache.last_accessed_at desc nulls last,
           cache.updated_at desc nulls last
  limit 1
) img on true;
