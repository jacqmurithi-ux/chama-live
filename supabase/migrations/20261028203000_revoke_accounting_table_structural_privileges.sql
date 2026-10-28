-- Accounting tables are writable only through owner-controlled canonical RPCs.
-- Keep SELECT for the authenticated app, but remove dangerous structural privileges
-- that bypass row-level policies or allow untrusted roles to attach triggers.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.contributions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.contribution_allocations FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.contribution_obligations FROM PUBLIC, anon, authenticated;
