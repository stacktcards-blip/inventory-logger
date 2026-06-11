-- Add English promo-number fallback for raw card image previews.
--
-- Stackt stores English promo cards as split strict keys (e.g. set_abbr=SWSH,
-- num=144), while external/card-image sources often expose the printed promo
-- identifier as the card number/localId (e.g. SWSH144, XY01, SM210). Keep the
-- canonical raw/master-card keys split, but allow the image-cache join to also
-- match those printed promo identifiers for known English promo-era sets.

create index if not exists idx_tcgdex_image_cache_promo_lookup_normalized
on tcgdex_image_cache (
  provider,
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
    and (
      lower(trim(cache.card_num)) = lower(trim(r.num))
      or (
        lower(trim(coalesce(nullif(trim(r.lang), ''), usl.inferred_lang))) in ('eng', 'en', 'english')
        and upper(trim(r.set_abbr)) in ('XY', 'SM', 'SWSH', 'SVP', 'MEP')
        and lower(trim(cache.card_num)) in (
          lower(trim(r.set_abbr) || trim(r.num)),
          lower(trim(r.set_abbr) || lpad(regexp_replace(trim(r.num), '^0+', ''), 2, '0')),
          lower(trim(r.set_abbr) || lpad(regexp_replace(trim(r.num), '^0+', ''), 3, '0'))
        )
      )
    )
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
           case when lower(trim(cache.card_num)) = lower(trim(r.num)) then 0 else 1 end,
           cache.last_accessed_at desc nulls last,
           cache.updated_at desc nulls last
  limit 1
) img on true;
