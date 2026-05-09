update advertisements
set display_trigger = 'on-load'
where page_key = 'sports-bingo'
  and ad_type = 'inline'
  and placement_key in ('bingo-home-active-inline', 'bingo-home-final-inline')
  and display_trigger = 'on-scroll';
