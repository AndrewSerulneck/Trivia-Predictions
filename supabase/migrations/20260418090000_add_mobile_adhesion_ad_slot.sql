alter table advertisements
drop constraint if exists ads_slot_valid;

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
    'mobile-adhesion',
    'popup-on-entry',
    'popup-on-scroll'
  )
);
