-- Store invoice "Order No." from PSA Invoices emails; match by Submission No., show Order No. in UI.
-- Allow multiple lines per order (same submission, different invoice order numbers).
alter table psa_tracker.psa_order_invoice_lines
  add column if not exists invoice_order_no text;

update psa_tracker.psa_order_invoice_lines
  set invoice_order_no = submission_number
  where invoice_order_no is null;

alter table psa_tracker.psa_order_invoice_lines
  alter column invoice_order_no set not null;

alter table psa_tracker.psa_order_invoice_lines
  drop constraint if exists psa_order_invoice_lines_order_id_submission_number_key;

create unique index if not exists idx_psa_order_invoice_lines_order_id_invoice_order_no
  on psa_tracker.psa_order_invoice_lines(order_id, invoice_order_no);
