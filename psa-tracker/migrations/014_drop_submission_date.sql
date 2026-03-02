-- Remove submission_date from psa_orders (order number date).
alter table psa_tracker.psa_orders drop column if exists submission_date;
