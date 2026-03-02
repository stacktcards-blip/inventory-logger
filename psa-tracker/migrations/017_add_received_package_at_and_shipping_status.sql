-- received_package_at: when "We Received Your Package" email was received (Sync from Gmail)
-- shipping_status: latest DHL (or other) status from shipment sync
alter table psa_tracker.psa_orders
  add column if not exists received_package_at timestamptz;

alter table psa_tracker.psa_orders
  add column if not exists shipping_status text;

comment on column psa_tracker.psa_orders.received_package_at is 'When the We Received Your Package email was received (from Sync from Gmail)';
comment on column psa_tracker.psa_orders.shipping_status is 'Latest shipping status from carrier API (e.g. DHL)';
