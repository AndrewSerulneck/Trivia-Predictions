alter table venues
add column if not exists display_name text,
add column if not exists logo_text text,
add column if not exists icon_emoji text;

update venues
set display_name = coalesce(display_name, name)
where display_name is null;
