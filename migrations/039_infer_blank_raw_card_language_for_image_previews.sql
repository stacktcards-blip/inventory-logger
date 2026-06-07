-- Infer raw-card language for preview enrichment only when a set has exactly one
-- language in master_cards. This rescues historical raw rows where lang was left
-- blank (common for Japanese set abbreviations like S12a/SV8a/SV2D) without
-- changing raw_cards business data.
--
-- The raw row's original lang stays visible as-is. The inferred language is only
-- used for master_cards/image-cache joins and only when it is unambiguous.

create index if not exists idx_master_cards_set_lang_lookup
on master_cards (lower(trim(set_abbr)), lower(trim(lang)));

-- Drop/recreate instead of CREATE OR REPLACE because this view has changed shape
-- across earlier migrations and we want a complete, deterministic definition.
drop view if exists raw_cards_enriched;

create view raw_cards_enriched as
with unique_set_lang as (
  select
    lower(trim(set_abbr)) as set_abbr_key,
    min(trim(lang)) as inferred_lang
  from master_cards
  where set_abbr is not null and trim(set_abbr) <> ''
    and lang is not null and trim(lang) <> ''
  group by lower(trim(set_abbr))
  having count(distinct lower(trim(lang))) = 1
)
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
left join unique_set_lang usl
  on usl.set_abbr_key = lower(trim(r.set_abbr))
left join master_cards mc
  on lower(mc.set_abbr) = lower(r.set_abbr)
  and lower(mc.num) = lower(r.num)
  and lower(mc.lang) = lower(coalesce(nullif(trim(r.lang), ''), usl.inferred_lang))
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
      case lower(trim(coalesce(nullif(trim(r.lang), ''), usl.inferred_lang)))
        when 'eng' then 'en'
        when 'en' then 'en'
        when 'english' then 'en'
        when 'jpn' then 'ja'
        when 'jp' then 'ja'
        when 'ja' then 'ja'
        when 'japanese' then 'ja'
        else lower(trim(coalesce(nullif(trim(r.lang), ''), usl.inferred_lang)))
      end
    )
  order by (cache.image_url is not null or cache.image_small_url is not null) desc,
           cache.last_accessed_at desc nulls last,
           cache.updated_at desc nulls last
  limit 1
) img on true;
