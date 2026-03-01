alter table venues
add column if not exists address text;

update venues
set address = case id
  when 'venue-downtown' then 'Downtown Manhattan, New York, NY'
  when 'venue-uptown' then 'Uptown Manhattan, New York, NY'
  when 'venue-riverside' then 'Midtown West, New York, NY'
  else address
end
where address is null;
