-- Class-BARS Migration 13: Make set_venue_geofence SECURITY DEFINER


drop function if exists public.set_venue_geofence(
  uuid, text, double precision, double precision, numeric, jsonb
);

create or replace function public.set_venue_geofence(
  p_venue_id  uuid,
  p_shape     text,
  p_lat       double precision,
  p_lng       double precision,
  p_radius_m  numeric,
  p_corners   jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_venue    venues;
  v_fence    uuid;
  v_is_admin boolean;
  v_c1_lat   double precision;
  v_c1_lng   double precision;
  v_c2_lat   double precision;
  v_c2_lng   double precision;
  v_c3_lat   double precision;
  v_c3_lng   double precision;
  v_c4_lat   double precision;
  v_c4_lng   double precision;
begin
  -- Enforce admin role explicitly (runs as function owner, bypasses RLS)
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'Only admins can manage venue geofences';
  end if;

  if p_shape not in ('circle', 'box') then
    raise exception 'Shape must be circle or box';
  end if;

  select *
  into v_venue
  from public.venues
  where id = p_venue_id;

  if v_venue.id is null then
    raise exception 'Venue not found';
  end if;

  if v_venue.geofence_id is not null then
    select id
    into v_fence
    from public.geofences
    where id = v_venue.geofence_id;
  end if;

  if p_shape = 'circle' then
    if p_lat is null or p_lng is null or p_radius_m is null then
      raise exception 'Circle needs a centre and radius';
    end if;
    if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'Circle centre is out of range';
    end if;
    if p_radius_m < 2 or p_radius_m > 50 then
      raise exception 'Radius must be between 2 and 50 metres';
    end if;

    if v_fence is null then
      insert into public.geofences (
        shape, center_lat, center_lng, radius_m
      ) values (
        'circle', p_lat, p_lng, p_radius_m
      )
      returning id into v_fence;
    else
      update public.geofences
      set shape = 'circle',
          center_lat = p_lat,
          center_lng = p_lng,
          radius_m   = p_radius_m,
          c1_lat     = null, c1_lng = null,
          c2_lat     = null, c2_lng = null,
          c3_lat     = null, c3_lng = null,
          c4_lat     = null, c4_lng = null,
          updated_at = now()
      where id = v_fence;
    end if;
  else
    if p_corners is null
       or jsonb_typeof(p_corners) <> 'array'
       or jsonb_array_length(p_corners) <> 4 then
      raise exception 'A class box needs exactly four corners';
    end if;

    v_c1_lat := (p_corners -> 0 ->> 'lat')::double precision;
    v_c1_lng := (p_corners -> 0 ->> 'lng')::double precision;
    v_c2_lat := (p_corners -> 1 ->> 'lat')::double precision;
    v_c2_lng := (p_corners -> 1 ->> 'lng')::double precision;
    v_c3_lat := (p_corners -> 2 ->> 'lat')::double precision;
    v_c3_lng := (p_corners -> 2 ->> 'lng')::double precision;
    v_c4_lat := (p_corners -> 3 ->> 'lat')::double precision;
    v_c4_lng := (p_corners -> 3 ->> 'lng')::double precision;

    if v_c1_lat is null or v_c1_lng is null
       or v_c2_lat is null or v_c2_lng is null
       or v_c3_lat is null or v_c3_lng is null
       or v_c4_lat is null or v_c4_lng is null then
      raise exception 'Each box corner needs lat and lng';
    end if;

    if v_c1_lat not between -90 and 90
       or v_c2_lat not between -90 and 90
       or v_c3_lat not between -90 and 90
       or v_c4_lat not between -90 and 90
       or v_c1_lng not between -180 and 180
       or v_c2_lng not between -180 and 180
       or v_c3_lng not between -180 and 180
       or v_c4_lng not between -180 and 180 then
      raise exception 'A box corner is out of range';
    end if;

    if v_fence is null then
      insert into public.geofences (
        shape,
        c1_lat, c1_lng, c2_lat, c2_lng,
        c3_lat, c3_lng, c4_lat, c4_lng
      ) values (
        'box',
        v_c1_lat, v_c1_lng, v_c2_lat, v_c2_lng,
        v_c3_lat, v_c3_lng, v_c4_lat, v_c4_lng
      )
      returning id into v_fence;
    else
      update public.geofences
      set shape      = 'box',
          center_lat = null,
          center_lng = null,
          radius_m   = null,
          c1_lat     = v_c1_lat, c1_lng = v_c1_lng,
          c2_lat     = v_c2_lat, c2_lng = v_c2_lng,
          c3_lat     = v_c3_lat, c3_lng = v_c3_lng,
          c4_lat     = v_c4_lat, c4_lng = v_c4_lng,
          updated_at = now()
      where id = v_fence;
    end if;
  end if;

  update public.venues
  set geofence_id = v_fence
  where id = p_venue_id;

  if not found then
    raise exception 'Venue not found or not editable';
  end if;

  return v_fence;
end;
$$;

comment on function public.set_venue_geofence(uuid,text,double precision,double precision,numeric,jsonb) is
  'Atomically create/update a venue geofence as an admin (SECURITY DEFINER).';

revoke execute on function public.set_venue_geofence(
  uuid, text, double precision, double precision, numeric, jsonb
) from public, anon;
grant execute on function public.set_venue_geofence(
  uuid, text, double precision, double precision, numeric, jsonb
) to authenticated;
