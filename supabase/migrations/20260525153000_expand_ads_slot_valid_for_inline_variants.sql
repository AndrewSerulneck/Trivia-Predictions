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
    'popup-on-scroll',
    'venue-leaderboard-rows-1-10',
    'venue-leaderboard-rows-11-20',
    'venue-leaderboard-rows-21-30',
    'venue-leaderboard-rows-31-40',
    'venue-leaderboard-rows-41-50',
    'pickem-inline-cards-1-5',
    'pickem-inline-cards-6-10',
    'pickem-inline-cards-11-15',
    'pickem-inline-cards-16-20',
    'pickem-inline-cards-21-25',
    'pickem-inline-cards-26-30'
  )
);
