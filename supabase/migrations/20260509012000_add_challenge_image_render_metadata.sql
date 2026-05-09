alter table challenge_campaigns
  add column if not exists image_scale numeric(5,3) not null default 1.0,
  add column if not exists image_focus_x numeric(5,2) not null default 50,
  add column if not exists image_focus_y numeric(5,2) not null default 50,
  add column if not exists image_fit text not null default 'cover';

alter table challenge_campaigns
  drop constraint if exists challenge_campaigns_image_scale_range;
alter table challenge_campaigns
  add constraint challenge_campaigns_image_scale_range
  check (image_scale >= 0.6 and image_scale <= 2.5);

alter table challenge_campaigns
  drop constraint if exists challenge_campaigns_image_focus_x_range;
alter table challenge_campaigns
  add constraint challenge_campaigns_image_focus_x_range
  check (image_focus_x >= 0 and image_focus_x <= 100);

alter table challenge_campaigns
  drop constraint if exists challenge_campaigns_image_focus_y_range;
alter table challenge_campaigns
  add constraint challenge_campaigns_image_focus_y_range
  check (image_focus_y >= 0 and image_focus_y <= 100);

alter table challenge_campaigns
  drop constraint if exists challenge_campaigns_image_fit_valid;
alter table challenge_campaigns
  add constraint challenge_campaigns_image_fit_valid
  check (image_fit in ('cover', 'contain'));
