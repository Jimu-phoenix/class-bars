-- TEMPORARY TEST MIGRATION - DELETE AFTER TESTING
drop function if exists public.get_session_geofence_test(uuid);

create function public.get_session_geofence_test(p_session_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return (
    select json_build_object(
      'session_id', cs.id,
      'venue_id', v.id,
      'venue_name', v.name,
      'fence_id', v.geofence_id,
      'shape', g.shape,
      'center_lat', g.center_lat,
      'center_lng', g.center_lng,
      'radius_m', g.radius_m,
      'c1_lat', g.c1_lat, 'c1_lng', g.c1_lng,
      'c2_lat', g.c2_lat, 'c2_lng', g.c2_lng,
      'c3_lat', g.c3_lat, 'c3_lng', g.c3_lng,
      'c4_lat', g.c4_lat, 'c4_lng', g.c4_lng
    )
    from public.class_sessions cs
    left join public.venues v on v.id = cs.venue_id
    left join public.geofences g on g.id = v.geofence_id
    where cs.id = p_session_id
      and cs.status = 'ongoing'
  );
end;
$$;

grant execute on function public.get_session_geofence_test(uuid) to authenticated;
revoke execute on function public.get_session_geofence_test(uuid) from public, anon;

notify pgrst, 'reload schema';
