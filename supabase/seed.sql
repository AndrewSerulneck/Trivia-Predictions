-- Seed data for local/dev setup

insert into venues (id, name, address, latitude, longitude, radius)
values
  ('venue-downtown', 'Downtown Sports Bar', 'Downtown Manhattan, New York, NY', 40.712776, -74.005974, 100),
  ('venue-uptown', 'Uptown Taproom', 'Uptown Manhattan, New York, NY', 40.730610, -73.935242, 100),
  ('venue-riverside', 'Riverside Grill', 'Midtown West, New York, NY', 40.758896, -73.985130, 100)
on conflict (id) do update
set
  name = excluded.name,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  radius = excluded.radius;
