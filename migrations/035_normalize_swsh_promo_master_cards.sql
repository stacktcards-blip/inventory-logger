-- Normalize Sword & Shield Black Star Promo master_cards from per-card pseudo-set
-- abbreviations (SWSH001, SWSH002, ...) into Stackt's preferred strict key:
--   set_abbr = SWSH, num = 001, lang = ENG

begin;

update master_cards
set num = regexp_replace(set_abbr, '^SWSH', ''),
    set_abbr = 'SWSH'
where lower(lang) = 'eng'
  and set_abbr ~ '^SWSH[0-9]{3}$';

update card_sets
set canonical_set_name = 'SWSH Black Star Promos',
    notes = 'Stackt canonical grouped English Sword & Shield promo set; converted from per-card pseudo-set abbreviations SWSH001-SWSH307'
where lower(set_abbr) = 'swsh'
  and lower(lang) = 'eng';

insert into card_sets (set_abbr, lang, canonical_set_name, source, notes)
select
  'SWSH',
  'eng',
  'SWSH Black Star Promos',
  'manual',
  'Stackt canonical grouped English Sword & Shield promo set; converted from per-card pseudo-set abbreviations SWSH001-SWSH307'
where not exists (
  select 1 from card_sets where lower(set_abbr) = 'swsh' and lower(lang) = 'eng'
);

update external_card_set_mappings
set stackt_set_abbr = 'SWSH',
    status = 'confirmed',
    confidence = 'manual',
    notes = 'Confirmed after normalizing Stackt SWSH promo master_cards from per-card pseudo-set abbreviations to SWSH + num.'
where source = 'pokemon_price_tracker'
  and lang = 'ENG'
  and source_set_name = 'SWSH: Sword & Shield Promo Cards';

commit;
