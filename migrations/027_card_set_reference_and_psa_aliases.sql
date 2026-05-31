-- Canonical card-set reference + PSA set-name alias mapping.
-- Purpose:
--   PSA titles are inconsistent: language, set code, set name, card number and card name
--   appear in different orders and sometimes partially parsed. This table gives the parser
--   a strict bridge from messy PSA metadata to Stackt's master_cards key:
--     set_abbr + num + lang.

create table if not exists card_sets (
  id bigserial primary key,
  set_abbr text not null,
  lang text not null,
  canonical_set_name text,
  era text,
  release_region text,
  source text not null default 'master_cards',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lang = lower(lang))
);

create unique index if not exists idx_card_sets_abbr_lang_unique
  on card_sets(lower(set_abbr), lower(lang));
create index if not exists idx_card_sets_lang on card_sets(lang);
create index if not exists idx_card_sets_name_search
  on card_sets using gin(to_tsvector('simple', coalesce(canonical_set_name, '') || ' ' || set_abbr));

-- Seed every strict query key currently represented in master_cards.
insert into card_sets (set_abbr, lang, source)
select distinct mc.set_abbr, lower(mc.lang), 'master_cards'
from master_cards mc
where mc.set_abbr is not null
  and mc.lang is not null
on conflict do nothing;

create table if not exists card_set_aliases (
  id bigserial primary key,
  card_set_id bigint not null references card_sets(id) on delete cascade,
  alias_name text not null,
  alias_set_code text,
  alias_language_text text,
  source text not null default 'psa',
  confidence text not null default 'candidate'
    check (confidence in ('manual', 'high', 'candidate', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_card_set_aliases_unique
  on card_set_aliases(
    card_set_id,
    lower(alias_name),
    lower(coalesce(alias_set_code, '')),
    lower(coalesce(alias_language_text, ''))
  );
create index if not exists idx_card_set_aliases_lookup
  on card_set_aliases(
    lower(alias_name),
    lower(coalesce(alias_set_code, '')),
    lower(coalesce(alias_language_text, ''))
  );
create index if not exists idx_card_set_aliases_name_search
  on card_set_aliases using gin(to_tsvector('simple', alias_name || ' ' || coalesce(alias_set_code, '') || ' ' || coalesce(alias_language_text, '')));

-- Seed high-signal PSA alias candidates only where PSA set_code already equals a known Stackt set_abbr
-- and language maps cleanly to the current master_cards languages. Ambiguous/missing codes are left
-- for the review view below rather than auto-mapped.
insert into card_set_aliases (card_set_id, alias_name, alias_set_code, alias_language_text, source, confidence, notes)
select distinct
  cs.id,
  trim(psa.set_name),
  trim(psa.set_code),
  trim(psa.language_or_release),
  'psa_grading_order_rows',
  'candidate',
  'Auto-seeded from PSA rows where set_code matched card_sets.set_abbr exactly; review before trusting for bulk promotion.'
from psa_grading_order_rows psa
join card_sets cs
  on lower(cs.set_abbr) = lower(trim(psa.set_code))
  and cs.lang = case
    when upper(trim(coalesce(psa.language_or_release, ''))) = 'JAPANESE' then 'jpn'
    when upper(trim(coalesce(psa.language_or_release, ''))) = 'EN' then 'eng'
    when upper(trim(coalesce(psa.language_or_release, ''))) = 'ENGLISH' then 'eng'
    else null
  end
where nullif(trim(coalesce(psa.set_name, '')), '') is not null
on conflict do nothing;

create or replace view psa_set_alias_review as
select
  upper(trim(coalesce(psa.language_or_release, ''))) as psa_language_text,
  upper(trim(coalesce(psa.set_code, ''))) as psa_set_code,
  upper(trim(coalesce(psa.set_name, ''))) as psa_set_name,
  count(*) as row_count,
  count(*) filter (where psa.master_card_match_status = 'MATCHED_CONFIRMED') as confirmed_count,
  min(psa.created_at) as first_seen_at,
  max(psa.created_at) as last_seen_at,
  max(csa.id) as existing_alias_id,
  max(cs.set_abbr) as mapped_set_abbr,
  max(cs.lang) as mapped_lang
from psa_grading_order_rows psa
left join card_set_aliases csa
  on lower(csa.alias_name) = lower(trim(coalesce(psa.set_name, '')))
  and lower(coalesce(csa.alias_set_code, '')) = lower(trim(coalesce(psa.set_code, '')))
  and lower(coalesce(csa.alias_language_text, '')) = lower(trim(coalesce(psa.language_or_release, '')))
  and csa.confidence <> 'rejected'
left join card_sets cs on cs.id = csa.card_set_id
where nullif(trim(coalesce(psa.set_name, '')), '') is not null
   or nullif(trim(coalesce(psa.set_code, '')), '') is not null
   or nullif(trim(coalesce(psa.language_or_release, '')), '') is not null
group by
  upper(trim(coalesce(psa.language_or_release, ''))),
  upper(trim(coalesce(psa.set_code, ''))),
  upper(trim(coalesce(psa.set_name, '')))
order by row_count desc;

-- Reuse the updated_at helper created by migration 024.
drop trigger if exists card_sets_updated_at on card_sets;
create trigger card_sets_updated_at
  before update on card_sets
  for each row execute function graded_reconciliation_updated_at();

drop trigger if exists card_set_aliases_updated_at on card_set_aliases;
create trigger card_set_aliases_updated_at
  before update on card_set_aliases
  for each row execute function graded_reconciliation_updated_at();

alter table card_sets enable row level security;
alter table card_set_aliases enable row level security;

drop policy if exists "Authenticated users can select card sets" on card_sets;
create policy "Authenticated users can select card sets"
  on card_sets for select to authenticated using (true);
drop policy if exists "Authenticated users can insert card sets" on card_sets;
create policy "Authenticated users can insert card sets"
  on card_sets for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update card sets" on card_sets;
create policy "Authenticated users can update card sets"
  on card_sets for update to authenticated using (true);

drop policy if exists "Authenticated users can select card set aliases" on card_set_aliases;
create policy "Authenticated users can select card set aliases"
  on card_set_aliases for select to authenticated using (true);
drop policy if exists "Authenticated users can insert card set aliases" on card_set_aliases;
create policy "Authenticated users can insert card set aliases"
  on card_set_aliases for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update card set aliases" on card_set_aliases;
create policy "Authenticated users can update card set aliases"
  on card_set_aliases for update to authenticated using (true);
