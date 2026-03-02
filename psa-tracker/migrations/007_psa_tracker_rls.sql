-- RLS for PSA tracker tables. Authenticated users can CRUD.

alter table psa_tracker.psa_orders enable row level security;
alter table psa_tracker.psa_order_cards enable row level security;
alter table psa_tracker.psa_order_events enable row level security;
alter table psa_tracker.psa_notifications enable row level security;

-- psa_orders
create policy "Authenticated users can select psa_orders"
  on psa_tracker.psa_orders for select to authenticated using (true);

create policy "Authenticated users can insert psa_orders"
  on psa_tracker.psa_orders for insert to authenticated with check (true);

create policy "Authenticated users can update psa_orders"
  on psa_tracker.psa_orders for update to authenticated using (true);

create policy "Authenticated users can delete psa_orders"
  on psa_tracker.psa_orders for delete to authenticated using (true);

-- psa_order_cards
create policy "Authenticated users can select psa_order_cards"
  on psa_tracker.psa_order_cards for select to authenticated using (true);

create policy "Authenticated users can insert psa_order_cards"
  on psa_tracker.psa_order_cards for insert to authenticated with check (true);

create policy "Authenticated users can update psa_order_cards"
  on psa_tracker.psa_order_cards for update to authenticated using (true);

create policy "Authenticated users can delete psa_order_cards"
  on psa_tracker.psa_order_cards for delete to authenticated using (true);

-- psa_order_events (audit - typically insert-only from app)
create policy "Authenticated users can select psa_order_events"
  on psa_tracker.psa_order_events for select to authenticated using (true);

create policy "Authenticated users can insert psa_order_events"
  on psa_tracker.psa_order_events for insert to authenticated with check (true);

-- psa_notifications
create policy "Authenticated users can select psa_notifications"
  on psa_tracker.psa_notifications for select to authenticated using (true);

create policy "Authenticated users can insert psa_notifications"
  on psa_tracker.psa_notifications for insert to authenticated with check (true);
