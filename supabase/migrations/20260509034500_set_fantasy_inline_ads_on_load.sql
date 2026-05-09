update advertisements
set display_trigger = 'on-load'
where page_key = 'fantasy'
  and ad_type = 'inline'
  and placement_key = 'fantasy-inline'
  and display_trigger = 'on-scroll';
