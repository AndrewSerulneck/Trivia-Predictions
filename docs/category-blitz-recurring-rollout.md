# Category Blitz Recurring Schedule Rollout

## Database

No new migration is required for this rollout. `category_blitz_schedules` already
has:

- `recurring_type` with allowed values `none`, `daily`, `weekly`
- `recurring_days` as a weekday-key array
- `window_minutes` for recurring occurrence duration

## Runtime

The existing `/api/cron/category-blitz-score` cron remains the production driver
and is already scheduled every minute in `vercel.json`. Player/session polling
also calls `driveVenueCategoryBlitz`, so local and preview environments continue
to advance scheduled games without Vercel Cron.

## Rollout Checks

After deploy, verify:

- Existing one-off Category Blitz schedules still show as `One-off` in Admin.
- Creating a daily Category Blitz schedule stores `recurringType: daily`.
- Creating a weekly schedule requires at least one weekday.
- A weekly schedule opens on the selected weekday and does not open on unselected days.
- Editing start time, duration, timezone, or recurrence restarts only auto sessions.
- Manual Category Blitz sessions are not ended by schedule edits.

## Monitoring

Watch the Category Blitz cron response/log output for:

- `opened`: expected venue IDs when recurring windows begin
- `started`: expected venue IDs after lobby dwell
- `ended`: expected venue IDs when windows close
- `errors`: should remain empty

If a venue appears stuck, deleting or editing the schedule should abandon/end the
active auto session and let the next client poll recreate the correct state.
