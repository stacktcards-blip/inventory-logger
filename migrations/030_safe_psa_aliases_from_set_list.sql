-- Additional safe PSA set aliases derived from the user-provided canonical set_abbr list.

with manual_aliases(set_abbr, lang, alias_name, alias_set_code, alias_language_text, notes) as (
  values
    ('S10a', 'jpn', 'JAPANESE SWORD & SHIELD DARK PHANTASMA', null, null, 'Safe alias from user set_abbr list canonical Dark Phantasma.'),
    ('MEG', 'eng', 'MEGA EVOLUTION', 'EN', 'MEG', 'PSA split fields for English Mega Evolution.'),
    ('TEU', 'eng', 'SUN & MOON TEAM UP', null, null, 'PSA includes era prefix; maps to English Team Up.'),
    ('S8a', 'jpn', 'JAPANESE 25TH ANNIVERSARY COLLECTION', null, null, 'PSA name maps to Japanese 25th Anniversary Set.'),
    ('CZ', 'eng', 'SWORD AND SHIELD CROWN ZENITH', null, null, 'PSA includes Sword and Shield prefix; maps to Crown Zenith.'),
    ('PRE', 'eng', 'PRISMATIC EVOLUTIONS', 'EN', 'PRE', 'PSA split fields for English Prismatic Evolutions.'),
    ('XY-P', 'jpn', 'JAPANESE XY PROMO', null, null, 'Japanese XY promo maps to XY-P.'),
    ('SM12a', 'jpn', 'JAPANESE SUN & MOON TAG TEAM GX ALL STARS', null, null, 'PSA name maps to Tag Team All Stars.'),
    ('CP6', 'jpn', 'JAPANESE EXPANSION 20TH ANNIVERSARY', null, null, 'PSA name maps to Japanese Expansion 20th Anniversary / CP6.')
)
insert into card_set_aliases (card_set_id, alias_name, alias_set_code, alias_language_text, source, confidence, notes)
select cs.id, ma.alias_name, ma.alias_set_code, ma.alias_language_text, 'canonical_set_list_safe_alias_2026_05_31', 'manual', ma.notes
from manual_aliases ma
join card_sets cs on lower(cs.set_abbr)=lower(ma.set_abbr) and cs.lang=ma.lang
on conflict do nothing;
