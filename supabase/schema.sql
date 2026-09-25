-- Trouve database schema (Supabase / PostgreSQL)
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  teacher text,
  room text,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  recurrence_end date,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists cancellations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  reported_by uuid not null references profiles(id) on delete cascade,
  reason text not null default 'teacher_absent',
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists cancellation_confirmations (
  cancellation_id uuid not null references cancellations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  confirmation boolean not null,
  created_at timestamptz not null default now(),
  primary key (cancellation_id, user_id)
);

-- Trigger: create a profile automatically after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Row Level Security
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table events enable row level security;
alter table cancellations enable row level security;
alter table cancellation_confirmations enable row level security;

create policy "profiles readable by authenticated users"
on profiles for select to authenticated using (true);

create policy "users update own profile"
on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "members can read groups"
on groups for select to authenticated using (
  owner_id = auth.uid() or exists (
    select 1 from group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid()
  )
);

create policy "users create groups"
on groups for insert to authenticated with check (owner_id = auth.uid());

create policy "owners update groups"
on groups for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "members can read membership"
on group_members for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from groups g where g.id = group_members.group_id and g.owner_id = auth.uid()
  )
);

create policy "owners add members"
on group_members for insert to authenticated with check (
  exists (select 1 from groups g where g.id = group_members.group_id and g.owner_id = auth.uid())
);

create policy "users read own events"
on events for select to authenticated using (user_id = auth.uid());

create policy "users manage own events"
on events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Group members may see each other's events.
create policy "group members read events"
on events for select to authenticated using (
  exists (
    select 1
    from group_members mine
    join group_members other on other.group_id = mine.group_id
    where mine.user_id = auth.uid() and other.user_id = events.user_id
  )
);

create policy "group members read cancellations"
on cancellations for select to authenticated using (
  reported_by = auth.uid() or exists (
    select 1 from events e
    join group_members gm on gm.user_id = auth.uid()
    join group_members gm2 on gm2.group_id = gm.group_id and gm2.user_id = e.user_id
    where e.id = cancellations.event_id
  )
);

create policy "authenticated users report cancellations"
on cancellations for insert to authenticated with check (reported_by = auth.uid());

create policy "users read cancellation confirmations"
on cancellation_confirmations for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from cancellations c where c.id = cancellation_id and c.reported_by = auth.uid()
  )
);

create policy "users add cancellation confirmations"
on cancellation_confirmations for insert to authenticated with check (user_id = auth.uid());

-- Realtime
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table cancellations;
alter publication supabase_realtime add table cancellation_confirmations;
