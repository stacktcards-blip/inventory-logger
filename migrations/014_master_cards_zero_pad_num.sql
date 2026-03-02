-- Zero-pad card numbers to 3 digits (001, 029, etc.) for master_cards id 4781-12407
-- Only updates rows where num is purely numeric (no lettered prefix like SV001)

update master_cards
set num = lpad(trim(num), 3, '0')
where id between 4781 and 12407
  and num ~ '^[0-9]+$'
  and length(trim(num)) < 3;
