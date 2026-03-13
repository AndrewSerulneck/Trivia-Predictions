-- Seed data for local/dev setup

insert into venues (id, name, address, latitude, longitude, radius)
values
  ('venue-downtown', 'Brunswick Grove', '327 Milltown Rd, East Brunswick, NJ', 40.4376405, -74.4264871, 100),
  ('venue-uptown', 'General Saloon', 'Uptown Manhattan, New York, NY', 40.730610, -73.935242, 100),
  ('venue-riverside', 'Buffalo Wild Wings', 'Midtown West, New York, NY', 40.758896, -73.985130, 100)
on conflict (id) do update
do nothing;
