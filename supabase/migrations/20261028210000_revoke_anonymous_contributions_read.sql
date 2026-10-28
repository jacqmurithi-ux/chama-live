-- Contributions are group-private; anonymous clients have no legitimate direct read path.
-- RLS already limits SELECT policies to authenticated group members, so remove the
-- redundant table-level SELECT grant as defense in depth.
REVOKE SELECT ON TABLE public.contributions FROM PUBLIC, anon;
