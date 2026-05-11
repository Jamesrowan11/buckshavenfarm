-- ============================================================
-- Bucks Haven Farm — Supabase schema
-- ============================================================
-- Run this in the Supabase SQL editor.
-- After running, create auth users via Supabase Dashboard
-- (Authentication > Users > Add user) for each entry in the
-- profiles seed below, then update profiles.id to match the
-- generated auth.users.id (the trigger will auto-create a row
-- with default role 'employee' that you can promote).
-- ============================================================

-- ---------- Helpers ----------
create extension if not exists "pgcrypto";

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text unique,
  role text not null default 'employee' check (role in ('admin','employee')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'employee'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- tasks ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  due_date date,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- shifts ----------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- availability ----------
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  available_days jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- time_off_requests ----------
create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- horses ----------
create table if not exists public.horses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- feeding_charts ----------
create table if not exists public.feeding_charts (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references public.horses(id) on delete cascade,
  am_feed text,
  pm_feed text,
  supplements text,
  special_notes text,
  responsible_employee uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- feeding_logs ----------
create table if not exists public.feeding_logs (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid references public.feeding_charts(id) on delete cascade,
  horse_id uuid references public.horses(id) on delete cascade,
  employee_id uuid references public.profiles(id) on delete set null,
  feeding_type text not null check (feeding_type in ('AM','PM')),
  done boolean not null default false,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (horse_id, feeding_type, date)
);

-- ---------- announcements ----------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- clock_logs ----------
create table if not exists public.clock_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_name text not null default '',
  action text not null check (action in ('in','out')),
  created_at timestamptz not null default now()
);

-- ---------- admin_notes ----------
create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.shifts enable row level security;
alter table public.availability enable row level security;
alter table public.time_off_requests enable row level security;
alter table public.horses enable row level security;
alter table public.feeding_charts enable row level security;
alter table public.feeding_logs enable row level security;
alter table public.announcements enable row level security;
alter table public.clock_logs enable row level security;
alter table public.admin_notes enable row level security;

-- profiles: everyone reads; admins write; self may update own name
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- tasks: everyone reads; admins manage; assignee may mark done
drop policy if exists "tasks_select_all" on public.tasks;
create policy "tasks_select_all" on public.tasks
  for select using (auth.role() = 'authenticated');

drop policy if exists "tasks_admin_all" on public.tasks;
create policy "tasks_admin_all" on public.tasks
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "tasks_assignee_update" on public.tasks;
create policy "tasks_assignee_update" on public.tasks
  for update using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- shifts: employees see their own + admins see all; admins manage
drop policy if exists "shifts_select" on public.shifts;
create policy "shifts_select" on public.shifts
  for select using (employee_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "shifts_admin_all" on public.shifts;
create policy "shifts_admin_all" on public.shifts
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- availability: employee owns theirs; admins read all
drop policy if exists "availability_select" on public.availability;
create policy "availability_select" on public.availability
  for select using (employee_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "availability_employee_write" on public.availability;
create policy "availability_employee_write" on public.availability
  for all using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

drop policy if exists "availability_admin_all" on public.availability;
create policy "availability_admin_all" on public.availability
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- time_off_requests: employee creates/views theirs; admins review all
drop policy if exists "time_off_select" on public.time_off_requests;
create policy "time_off_select" on public.time_off_requests
  for select using (employee_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "time_off_employee_insert" on public.time_off_requests;
create policy "time_off_employee_insert" on public.time_off_requests
  for insert with check (employee_id = auth.uid());

drop policy if exists "time_off_admin_all" on public.time_off_requests;
create policy "time_off_admin_all" on public.time_off_requests
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- horses: everyone reads; admins write
drop policy if exists "horses_select_all" on public.horses;
create policy "horses_select_all" on public.horses
  for select using (auth.role() = 'authenticated');

drop policy if exists "horses_admin_all" on public.horses;
create policy "horses_admin_all" on public.horses
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- feeding_charts: everyone reads; admins write
drop policy if exists "fc_select_all" on public.feeding_charts;
create policy "fc_select_all" on public.feeding_charts
  for select using (auth.role() = 'authenticated');

drop policy if exists "fc_admin_all" on public.feeding_charts;
create policy "fc_admin_all" on public.feeding_charts
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- feeding_logs: everyone reads; any authenticated employee can upsert today's mark; admins all
drop policy if exists "fl_select_all" on public.feeding_logs;
create policy "fl_select_all" on public.feeding_logs
  for select using (auth.role() = 'authenticated');

drop policy if exists "fl_employee_write" on public.feeding_logs;
create policy "fl_employee_write" on public.feeding_logs
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "fl_employee_update" on public.feeding_logs;
create policy "fl_employee_update" on public.feeding_logs
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "fl_admin_all" on public.feeding_logs;
create policy "fl_admin_all" on public.feeding_logs
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- announcements: everyone reads; admins write
drop policy if exists "ann_select_all" on public.announcements;
create policy "ann_select_all" on public.announcements
  for select using (auth.role() = 'authenticated');

drop policy if exists "ann_admin_all" on public.announcements;
create policy "ann_admin_all" on public.announcements
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- clock_logs: user inserts own; user sees own; admins see all
drop policy if exists "cl_select" on public.clock_logs;
create policy "cl_select" on public.clock_logs
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "cl_user_insert" on public.clock_logs;
create policy "cl_user_insert" on public.clock_logs
  for insert with check (user_id = auth.uid());

drop policy if exists "cl_admin_all" on public.clock_logs;
create policy "cl_admin_all" on public.clock_logs
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- admin_notes: admins only
drop policy if exists "an_admin_all" on public.admin_notes;
create policy "an_admin_all" on public.admin_notes
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ============================================================
-- Seed: promote known admins
-- Run AFTER creating the auth users in the Supabase Dashboard
-- (Authentication > Users > Add user) for each email below.
-- The handle_new_user trigger will create their profile rows
-- with role='employee'; this block promotes the two admins.
-- ============================================================

update public.profiles
   set role = 'admin',
       name = case email
                when 'james@northvaleunified.com' then 'James Rowan'
                when 'cynthiarowan777@gmail.com' then 'Cynthia Baker'
              end
 where lower(email) in ('james@northvaleunified.com', 'cynthiarowan777@gmail.com');

update public.profiles
   set name = case email
                when 'theresarowan777@gmail.com' then 'Theresa Rowan'
                when 'landenrowan@gmail.com' then 'Landen Rowan'
              end
 where lower(email) in ('theresarowan777@gmail.com', 'landenrowan@gmail.com');
