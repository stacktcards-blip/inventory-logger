-- Invoice lines from PSA Invoices emails: multiple submission numbers / amounts per order
create table if not exists psa_tracker.psa_order_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references psa_tracker.psa_orders(id) on delete cascade,
  submission_number text not null,
  order_amount numeric,
  payment_amount numeric,
  balance_due numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, submission_number)
);

create index if not exists idx_psa_order_invoice_lines_order_id on psa_tracker.psa_order_invoice_lines(order_id);

alter table psa_tracker.psa_order_invoice_lines enable row level security;

create policy "Authenticated users can select psa_order_invoice_lines"
  on psa_tracker.psa_order_invoice_lines for select to authenticated using (true);
create policy "Authenticated users can insert psa_order_invoice_lines"
  on psa_tracker.psa_order_invoice_lines for insert to authenticated with check (true);
create policy "Authenticated users can update psa_order_invoice_lines"
  on psa_tracker.psa_order_invoice_lines for update to authenticated using (true);
create policy "Authenticated users can delete psa_order_invoice_lines"
  on psa_tracker.psa_order_invoice_lines for delete to authenticated using (true);

create trigger psa_order_invoice_lines_updated_at
  before update on psa_tracker.psa_order_invoice_lines
  for each row execute function psa_tracker.psa_tracker_updated_at();
