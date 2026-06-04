-- Sales Packing saved-session hardening for cert warning lookups.
-- Keeps scans read-only: this only normalizes persisted cert text for duplicate/warning queries.

create or replace function normalize_sales_packing_cert(raw_cert text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(coalesce(raw_cert, '')), '[^0-9A-Z]', '', 'g'), '')
$$;

alter table sales_packing_rows
  add column if not exists cert_scanned_normalized text;

update sales_packing_rows
set cert_scanned_normalized = normalize_sales_packing_cert(cert_scanned)
where cert_scanned_normalized is distinct from normalize_sales_packing_cert(cert_scanned);

create or replace function set_sales_packing_cert_scanned_normalized()
returns trigger
language plpgsql
as $$
begin
  new.cert_scanned_normalized := normalize_sales_packing_cert(new.cert_scanned);
  return new;
end;
$$;

drop trigger if exists trg_sales_packing_rows_cert_scanned_normalized on sales_packing_rows;
create trigger trg_sales_packing_rows_cert_scanned_normalized
before insert or update of cert_scanned on sales_packing_rows
for each row execute function set_sales_packing_cert_scanned_normalized();

create index if not exists idx_sales_packing_rows_cert_scanned_normalized
  on sales_packing_rows(cert_scanned_normalized)
  where cert_scanned_normalized is not null and removed = false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_packing_rows_import_line_quantity_unique'
  ) then
    if exists (
      select 1
      from sales_packing_rows
      group by import_id, line_item_key, quantity_unit
      having count(*) > 1
    ) then
      raise notice 'Skipping sales_packing_rows_import_line_quantity_unique because duplicate rows already exist';
    else
      alter table sales_packing_rows
        add constraint sales_packing_rows_import_line_quantity_unique
        unique (import_id, line_item_key, quantity_unit);
    end if;
  end if;
end $$;
