-- Repair guard-trigger installation for candidate databases where the first
-- lifecycle migration was already applied before its trigger statement was added.
drop trigger if exists meetings_guard_lifecycle on public.meetings;
create trigger meetings_guard_lifecycle
before insert or update of status on public.meetings
for each row execute function public.guard_meeting_lifecycle();
