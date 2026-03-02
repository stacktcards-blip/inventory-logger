-- Split card number into set_abbr and num for Japanese cards with -P suffix
-- When set_abbr is empty and num contains /XY-P, /SM-P, /S-P, /SV-P, /M-P etc:
--   num "067/SV-P" -> set_abbr "SV-P", num "067"
-- Applies to Japanese cards (lang JPN/JAP) only.

update slabs
set
  set_abbr = trim(split_part(num, '/', 2)),
  num = trim(split_part(num, '/', 1))
where
  (set_abbr is null or trim(set_abbr) = '')
  and num like '%/%'
  and trim(split_part(num, '/', 2)) like '%-P'
  and lang in ('JPN', 'JAP', 'JA');
