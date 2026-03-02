-- Add sale-related columns to slabs for eBay Sales Intake

alter table slabs add column if not exists sale_price numeric;
alter table slabs add column if not exists sale_currency text;
alter table slabs add column if not exists ebay_sale_id uuid references ebay_sales(id);

create index if not exists idx_slabs_ebay_sale_id on slabs(ebay_sale_id);
