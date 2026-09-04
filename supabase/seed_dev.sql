-- Minimal dev seed: one test with 5 steps and one candidate, so the
-- candidate self-report flow can be exercised end-to-end before the
-- Admin console exists to create these through the UI.
insert into tests (name, slug) values ('September Load Test', 'september-load-test');

insert into steps (test_id, name, order_index, required)
select id, s.name, s.order_index, true
from tests, (values
  ('Terms & Conditions', 1),
  ('Join Session', 2),
  ('Camera Permission', 3),
  ('Microphone', 4),
  ('System Check', 5)
) as s(name, order_index)
where tests.slug = 'september-load-test';

insert into candidates (test_id, email)
select id, 'test@example.com' from tests where slug = 'september-load-test';
