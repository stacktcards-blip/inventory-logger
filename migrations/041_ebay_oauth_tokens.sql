create table if not exists ebay_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  store_account text not null,
  environment text not null default 'production',
  token_type text not null,
  scope text,
  access_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token text not null,
  refresh_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_account, environment)
);

alter table ebay_oauth_tokens enable row level security;

revoke all on table ebay_oauth_tokens from anon, authenticated;

create index if not exists idx_ebay_oauth_tokens_store_env
  on ebay_oauth_tokens(store_account, environment);
