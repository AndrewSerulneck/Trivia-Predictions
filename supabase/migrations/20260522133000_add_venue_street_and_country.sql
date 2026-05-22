alter table venues
  add column if not exists street text null,
  add column if not exists country text null;

update venues
set street = coalesce(street, address)
where street is null
  and address is not null;
