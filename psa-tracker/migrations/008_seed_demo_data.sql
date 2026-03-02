-- Optional seed/demo data for development.
-- Run only in dev; skip in production.

insert into psa_tracker.psa_orders (psa_order_number, status, status_detail, tracking_number, carrier, notes)
values ('12345678', 'Shipped', 'Order has been shipped', '1234567890', 'DHL', 'Demo order 1')
on conflict (psa_order_number) do nothing;

insert into psa_tracker.psa_orders (psa_order_number, status, status_detail, notes)
values ('87654321', 'Grading', 'Cards are being graded', 'Demo order 2')
on conflict (psa_order_number) do nothing;

insert into psa_tracker.psa_orders (psa_order_number, status, status_detail, notes)
values ('11111111', 'Received', 'Order received at PSA', 'Demo order 3')
on conflict (psa_order_number) do nothing;

-- Demo cards for order 12345678 (only if none exist)
insert into psa_tracker.psa_order_cards (order_id, card_name, set_abbr, card_number, lang, quantity, grade_result, cert_number)
select o.id, 'Charizard', '1ED', '4', 'EN', 1, 'PSA 9', '12345678'
from psa_tracker.psa_orders o
where o.psa_order_number = '12345678'
  and not exists (select 1 from psa_tracker.psa_order_cards c where c.order_id = o.id);

insert into psa_tracker.psa_order_cards (order_id, card_name, set_abbr, card_number, lang, quantity)
select o.id, 'Pikachu', '1ED', '58', 'EN', 2
from psa_tracker.psa_orders o
where o.psa_order_number = '12345678'
  and (select count(*) from psa_tracker.psa_order_cards c where c.order_id = o.id) = 1;
