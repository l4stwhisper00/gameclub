-- The chess Edge Function reads room metadata using the service-role client.
-- This is server-only access; authenticated and anon keep their existing restrictions.
grant select on table public.club_rooms to service_role;
