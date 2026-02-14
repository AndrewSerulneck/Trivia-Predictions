-- Seed data for local/dev setup

insert into venues (id, name, latitude, longitude, radius)
values
  ('venue-downtown', 'Downtown Sports Bar', 40.712776, -74.005974, 100),
  ('venue-uptown', 'Uptown Taproom', 40.730610, -73.935242, 100),
  ('venue-riverside', 'Riverside Grill', 40.758896, -73.985130, 100)
on conflict (id) do update
set
  name = excluded.name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  radius = excluded.radius;
