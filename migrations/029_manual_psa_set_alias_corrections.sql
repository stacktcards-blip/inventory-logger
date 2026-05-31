-- Manual PSA set alias corrections confirmed by user.
-- These handle PSA title/field ordering issues before strict master_cards validation.

with manual_aliases(set_abbr, lang, alias_name, alias_set_code, alias_language_text, notes) as (
  values
    ('S-P', 'jpn', 'JAPANESE S PROMO', null, null, 'User confirmed Japanese S Promo maps to S-P'),
    ('SVP', 'eng', 'SV BLACK STAR PROMO', 'EN', 'SVP', 'PSA places SVP in language_or_release and EN in set_code for English SV Black Star Promo'),
    ('S8b', 'jpn', 'JAPANESE SWORD & SHIELD VMAX CLIMAX', null, null, 'User confirmed direct match to VMAX Climax'),
    ('S12a', 'jpn', 'JAPANESE SWORD & SHIELD VSTAR UNIVERSE', null, null, 'User confirmed direct match to VSTAR Universe'),
    ('EVS', 'eng', 'SWORD & SHIELD EVOLVING SKIES', null, null, 'User confirmed Sword & Shield prefix can be ignored; maps to Evolving Skies'),
    ('SV-P', 'jpn', 'JAPANESE SV P PROMO', null, null, 'User confirmed Japanese SV P Promo maps to SV-P'),
    ('SV-P', 'jpn', 'P PROMO', 'SV', 'JAPANESE', 'PSA splits Japanese SV-P Promo as JAPANESE / SV / P PROMO'),
    ('CELC', 'eng', 'CELEBRATIONS CLASSIC COLLECTION', null, null, 'Maps to Celebrations Classic Collection / CELC'),
    ('SV-P', 'jpn', 'JAPANESE SV PROMO', null, null, 'User confirmed Japanese SV Promo maps to SV-P'),
    ('SM-P', 'jpn', 'JAPANESE SM PROMO', null, null, 'User confirmed Japanese SM Promo maps to SM-P'),
    ('SSP', 'eng', 'SURGING SPARKS', null, null, 'User confirmed Surging Sparks maps directly'),
    ('SSP', 'eng', 'SURGING SPARKS', 'EN', 'SSP', 'PSA places SSP in language_or_release and EN in set_code for Surging Sparks'),
    ('DRI', 'eng', 'DESTINED RIVALS', 'EN', 'DRI', 'Direct English Destined Rivals alias from PSA split fields')
)
insert into card_set_aliases (card_set_id, alias_name, alias_set_code, alias_language_text, source, confidence, notes)
select cs.id, ma.alias_name, ma.alias_set_code, ma.alias_language_text, 'manual_user_correction_2026_05_31', 'manual', ma.notes
from manual_aliases ma
join card_sets cs on lower(cs.set_abbr)=lower(ma.set_abbr) and cs.lang=ma.lang
on conflict do nothing;
