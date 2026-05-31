-- User-confirmed PSA parser corrections for remaining unmapped/wrongly era-prefixed sets.
-- Note: Battle FireRed & LeafGreen is intentionally left unmapped per user instruction.

with new_sets(set_abbr, lang, canonical_set_name) as (
  values
    ('MEP', 'eng', 'ME Black Star Promo'),
    ('SVG', 'jpn', 'Venusaur & Charizard & Blastoise Special Deck Set ex')
)
insert into card_sets (set_abbr, lang, canonical_set_name, source, notes)
select set_abbr, lang, canonical_set_name, 'manual_user_correction_2026_05_31', 'Added for PSA alias resolution; master_cards coverage may still be incomplete.'
from new_sets
where not exists (
  select 1 from card_sets cs
  where lower(cs.set_abbr)=lower(new_sets.set_abbr) and cs.lang=new_sets.lang
);

with manual_aliases(set_abbr, lang, alias_name, alias_set_code, alias_language_text, notes) as (
  values
    ('MEP', 'eng', 'ME BLACK STAR PROMO', 'EN', 'MEP', 'User confirmed ME Black Star Promo maps to MEP.'),
    ('old4', 'jpn', 'JAPANESE ROCKET', null, null, 'User confirmed Japanese Rocket maps to old4.'),
    ('SVG', 'jpn', 'VENUSAUR & CHARIZARD & BLASTOISE SPECIAL DECK SET EX', 'SVG', 'JAPANESE', 'User confirmed SVG Special Deck Set ex maps to SVG.'),
    ('CRE', 'eng', 'SWORD & SHIELD CHILLING REIGN', null, null, 'Era-prefixed PSA name maps to Chilling Reign. master_cards currently uses CRE for Chilling Reign.'),
    ('SM11a', 'jpn', 'JAPANESE SUN & MOON REMIX BOUT', null, null, 'User confirmed Remix Bout maps to SM11a.')
)
insert into card_set_aliases (card_set_id, alias_name, alias_set_code, alias_language_text, source, confidence, notes)
select cs.id, ma.alias_name, ma.alias_set_code, ma.alias_language_text, 'manual_user_correction_2026_05_31', 'manual', ma.notes
from manual_aliases ma
join card_sets cs on lower(cs.set_abbr)=lower(ma.set_abbr) and cs.lang=ma.lang
on conflict do nothing;
