-- Slab intake drafts: one row per PSA cert lookup, pending approval before commit to slabs.

create table if not exists slab_intake_drafts (
  id uuid primary key default gen_random_uuid(),
  cert text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'committed', 'rejected')),
  -- Slab fields (nullable; filled from PSA API or manual edit)
  grade text,
  set_abbr text,
  num text,
  lang text,
  grading_company text,
  card_name text,
  is_1ed boolean,
  is_rev boolean,
  note text,
  order_number text,
  acquired_date date,
  image_url text,
  -- Raw PSA response for debugging and future field extraction
  result_json jsonb,
  -- Commit audit
  committed_at timestamptz,
  committed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One pending or approved draft per cert; committed/rejected certs can be re-submitted
create unique index if not exists idx_slab_intake_drafts_cert_pending
  on slab_intake_drafts(cert) where status in ('pending', 'approved');

create index if not exists idx_slab_intake_drafts_status on slab_intake_drafts(status);
create index if not exists idx_slab_intake_drafts_created_at on slab_intake_drafts(created_at desc);

-- updated_at trigger
create or replace function slab_intake_drafts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists slab_intake_drafts_updated_at on slab_intake_drafts;
create trigger slab_intake_drafts_updated_at
  before update on slab_intake_drafts
  for each row execute function slab_intake_drafts_updated_at();
