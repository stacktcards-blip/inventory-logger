-- Master card enrichment staging for external card-reference feeds.
-- Safe by design: external APIs stage candidates here first; master_cards remains canonical.

create table if not exists external_card_set_mappings (
  id bigserial primary key,
  source text not null,
  source_set_id text not null,
  source_set_name text,
  lang text not null,
  stackt_set_abbr text,
  confidence text not null default 'needs_review',
  status text not null default 'needs_review',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_set_id, lang)
);

create table if not exists master_card_import_staging (
  id bigserial primary key,
  source text not null,
  source_card_id text,
  source_set_id text,
  source_set_name text,
  source_card_name text,
  source_card_number text,
  source_language text,
  source_rarity text,
  normalized_card_name text,
  normalized_set_abbr text,
  normalized_num text,
  normalized_lang text not null default 'ENG',
  match_status text not null,
  match_reason text,
  existing_master_card_id integer references master_cards(id),
  raw_payload jsonb,
  reviewed_at timestamptz,
  reviewed_by text,
  review_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_card_id, normalized_lang)
);

create index if not exists idx_external_card_set_mappings_source_status
  on external_card_set_mappings (source, status, lang);

create index if not exists idx_master_card_import_staging_status
  on master_card_import_staging (match_status, review_status);

create index if not exists idx_master_card_import_staging_strict_key
  on master_card_import_staging (lower(normalized_set_abbr), lower(normalized_num), lower(normalized_lang));

create table if not exists master_card_variants (
  id bigserial primary key,
  master_card_id integer not null references master_cards(id) on delete cascade,
  variant_code text not null default 'BASE',
  variant_label text not null default 'Regular',
  rarity text,
  source text,
  source_card_id text,
  source_card_name text,
  source_card_number text,
  image_url text,
  image_small_url text,
  display_order integer not null default 0,
  is_default boolean not null default false,
  notes text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (master_card_id, variant_code),
  unique (source, source_card_id)
);

create unique index if not exists idx_master_card_variants_one_default
  on master_card_variants (master_card_id)
  where is_default;

create index if not exists idx_master_card_variants_master_card
  on master_card_variants (master_card_id, display_order, variant_label);

insert into master_card_variants (
  master_card_id,
  variant_code,
  variant_label,
  display_order,
  is_default,
  source,
  notes
)
select
  id,
  'BASE',
  'Regular',
  0,
  true,
  'stackt_master_cards',
  'Default base variant created from existing master_cards identity'
from master_cards
on conflict (master_card_id, variant_code) do nothing;

comment on table external_card_set_mappings is
  'Maps external API set identifiers to Stackt master_cards set_abbr values. Confirm these before importing master card candidates.';

comment on table master_card_import_staging is
  'Review queue for external card-reference records before any write to canonical master_cards. Duplicate strict keys are variant candidates, not automatic errors.';

comment on table master_card_variants is
  'Variant/printing rows attached to canonical master_cards base identities. master_cards remains set_abbr + num + lang.';
