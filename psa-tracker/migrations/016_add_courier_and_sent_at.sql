-- Full courier name and parcel sent date from "Your PSA order has shipped" emails.
alter table psa_tracker.psa_orders
  add column if not exists courier text;

alter table psa_tracker.psa_orders
  add column if not exists sent_at timestamptz;

comment on column psa_tracker.psa_orders.courier is 'Full shipping courier name from PSA shipped email (e.g. DHL Express Worldwide)';
comment on column psa_tracker.psa_orders.sent_at is 'Date parcel was sent, from PSA shipped email';
