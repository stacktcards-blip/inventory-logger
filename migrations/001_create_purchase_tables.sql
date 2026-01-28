create extension if not exists pgcrypto;

create table if not exists purchase_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type = 'japan_email'),
  source_system text not null,
  external_id text not null,
  thread_id text null,
  received_at timestamptz not null,
  raw_subject text null,
  raw_from text null,
  raw_body_text text null,
  raw_body_html text null,
  raw_snippet text null,
  order_no text null,
  parse_status text not null default 'pending' check (parse_status in ('pending','parsed','needs_review','error','approved','committed')),
  parse_error text null,
  parser_version text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (source_type, external_id),
  unique (content_hash)
);

create table if not exists purchase_parses (
  id uuid primary key default gen_random_uuid(),
  purchase_source_id uuid not null references purchase_sources(id) on delete cascade,
  parser_version text not null,
  parsed_at timestamptz not null default now(),
  status text not null check (status in ('ok','needs_review','error')),
  confidence numeric not null default 0,
  result_json jsonb not null,
  error text null
);

create table if not exists purchase_drafts (
  id uuid primary key default gen_random_uuid(),
  purchase_source_id uuid not null references purchase_sources(id) on delete cascade,
  purchase_parse_id uuid null references purchase_parses(id) on delete set null,
  line_no int not null,
  store text not null,
  purchase_date date null,
  card_name text null,
  set_abbr text null,
  card_num text null,
  lang text null,
  quantity int not null default 1,
  price_jpy numeric null,
  exchange_rate_formula text null,
  notes text null,
  confidence numeric not null default 0,
  flags jsonb not null default '[]'::jsonb,
  review_status text not null default 'needs_review' check (review_status in ('needs_review','approved','rejected')),
  reviewed_by text null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (purchase_source_id, line_no)
);

create table if not exists purchase_commits (
  id uuid primary key default gen_random_uuid(),
  purchase_source_id uuid not null references purchase_sources(id) on delete restrict,
  committed_at timestamptz not null default now(),
  committed_by text not null,
  commit_hash text not null,
  status text not null default 'committed' check (status in ('committed')),
  unique (purchase_source_id)
);
