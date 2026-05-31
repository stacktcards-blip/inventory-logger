-- Additional safe PSA aliases discovered during parser exception review.

with manual_aliases(set_abbr, lang, alias_name, alias_set_code, alias_language_text, notes) as (
  values
    ('SM9', 'jpn', 'JAPANESE SUN & MOON TAG BOLT', null, null, 'Safe alias from canonical set list: Tag Bolt.'),
    ('CP5', 'jpn', 'JAPANESE MYTHICAL & LEGENDARY DREAM SHINE COLLECTION', null, null, 'Safe alias from canonical set list: Mythical Legendary Dream Shine.')
)
insert into card_set_aliases (card_set_id, alias_name, alias_set_code, alias_language_text, source, confidence, notes)
select cs.id, ma.alias_name, ma.alias_set_code, ma.alias_language_text, 'parser_exception_safe_alias_2026_05_31', 'manual', ma.notes
from manual_aliases ma
join card_sets cs on lower(cs.set_abbr)=lower(ma.set_abbr) and cs.lang=ma.lang
on conflict do nothing;
