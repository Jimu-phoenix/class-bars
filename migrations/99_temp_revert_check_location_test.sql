-- REVERT OF TEMPORARY TEST MIGRATION
revoke execute on function public.get_session_geofence_test(uuid) from authenticated;
drop function if exists public.get_session_geofence_test(uuid);
