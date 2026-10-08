-- CHAMA LIVE — Meetings time/back-dated candidate migration
-- Candidate/E2600 only. Production is intentionally untouched.
-- Existing meeting times remain NULL when they are not known.

alter table public.meetings
  add column if not exists start_time time without time zone,
  add column if not exists end_time time without time zone,
  add column if not exists back_dated boolean not null default false;

alter table public.meetings
  drop constraint if exists meetings_end_after_start;

alter table public.meetings
  add constraint meetings_end_after_start
  check (
    end_time is null
    or start_time is null
    or end_time > start_time
  );
