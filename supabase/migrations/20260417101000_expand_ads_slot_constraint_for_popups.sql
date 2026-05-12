alter table advertisements
drop constraint if exists ads_slot_valid;

update advertisements
set slot = 'inline-content'
where slot is null
  or slot not in (
    'header',
    'inline-content',
    'sidebar',
    'mid-content',
    'leaderboard-sidebar',
    'footer',
    'popup-on-entry',
    'popup-on-scroll'
  );

alter table advertisements
add constraint ads_slot_valid
check (
  slot in (
    'header',
    'inline-content',
    'sidebar',
    'mid-content',
    'leaderboard-sidebar',
    'footer',
    'popup-on-entry',
    'popup-on-scroll'
  )
);
