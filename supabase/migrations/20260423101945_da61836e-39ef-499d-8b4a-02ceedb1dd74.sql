
-- =========================================================
-- ENUMS
-- =========================================================
create type public.app_role as enum ('admin', 'staff');
create type public.log_item_type as enum ('component', 'device');
create type public.log_action as enum ('in', 'out', 'assemble', 'deliver', 'adjust');

-- =========================================================
-- COMPANIES
-- =========================================================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

insert into public.companies (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Default Warehouse', 'default');

alter table public.companies enable row level security;

-- =========================================================
-- PROFILES
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- =========================================================
-- ROLES (separate table to avoid privilege escalation)
-- =========================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, company_id, role)
);

alter table public.user_roles enable row level security;

-- =========================================================
-- HELPER FUNCTIONS (security definer to avoid recursive RLS)
-- =========================================================
create or replace function public.get_user_company(_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = _user_id limit 1;
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_admin_of(_user_id uuid, _company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and company_id = _company_id
      and role = 'admin'
  );
$$;

-- =========================================================
-- AUTO PROFILE + ROLE ON SIGNUP
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_company uuid := '00000000-0000-0000-0000-000000000001';
  user_count int;
begin
  insert into public.profiles (id, company_id, full_name, email)
  values (new.id, default_company, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email);

  select count(*) into user_count from public.profiles;

  if user_count <= 1 then
    insert into public.user_roles (user_id, company_id, role)
    values (new.id, default_company, 'admin');
  else
    insert into public.user_roles (user_id, company_id, role)
    values (new.id, default_company, 'staff');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- COMPONENTS
-- =========================================================
create table public.components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  sku text not null,
  image_url text,
  stock_count integer not null default 0,
  minimum_threshold integer not null default 0,
  unit_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);

alter table public.components enable row level security;
create index components_company_idx on public.components(company_id);

-- =========================================================
-- DEVICES
-- =========================================================
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  sku text not null,
  image_url text,
  assembled_stock integer not null default 0,
  minimum_threshold integer not null default 0,
  unit_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);

alter table public.devices enable row level security;
create index devices_company_idx on public.devices(company_id);

-- =========================================================
-- DEVICE RECIPES (BOM)
-- =========================================================
create table public.device_recipes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unique (device_id, component_id)
);

alter table public.device_recipes enable row level security;

-- =========================================================
-- DEVICE DEPENDENCIES (Device A delivery consumes Device B)
-- =========================================================
create table public.device_dependencies (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  depends_on_device_id uuid not null references public.devices(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unique (device_id, depends_on_device_id),
  check (device_id <> depends_on_device_id)
);

alter table public.device_dependencies enable row level security;

-- =========================================================
-- INVENTORY LOGS
-- =========================================================
create table public.inventory_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  item_type public.log_item_type not null,
  item_id uuid not null,
  item_name text not null,
  action public.log_action not null,
  quantity integer not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.inventory_logs enable row level security;
create index inventory_logs_company_idx on public.inventory_logs(company_id, created_at desc);

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- companies: users see their own company
create policy "view own company" on public.companies
for select to authenticated
using (id = public.get_user_company(auth.uid()));

-- profiles
create policy "view profiles in own company" on public.profiles
for select to authenticated
using (company_id = public.get_user_company(auth.uid()));

create policy "update own profile" on public.profiles
for update to authenticated
using (id = auth.uid());

-- user_roles: users can view roles in own company
create policy "view roles in own company" on public.user_roles
for select to authenticated
using (company_id = public.get_user_company(auth.uid()));

create policy "admins manage roles" on public.user_roles
for all to authenticated
using (public.is_admin_of(auth.uid(), company_id))
with check (public.is_admin_of(auth.uid(), company_id));

-- components
create policy "view components" on public.components
for select to authenticated
using (company_id = public.get_user_company(auth.uid()));

create policy "admins insert components" on public.components
for insert to authenticated
with check (
  company_id = public.get_user_company(auth.uid())
  and public.is_admin_of(auth.uid(), company_id)
);

create policy "admins update components" on public.components
for update to authenticated
using (public.is_admin_of(auth.uid(), company_id))
with check (public.is_admin_of(auth.uid(), company_id));

create policy "admins delete components" on public.components
for delete to authenticated
using (public.is_admin_of(auth.uid(), company_id));

-- devices
create policy "view devices" on public.devices
for select to authenticated
using (company_id = public.get_user_company(auth.uid()));

create policy "admins insert devices" on public.devices
for insert to authenticated
with check (
  company_id = public.get_user_company(auth.uid())
  and public.is_admin_of(auth.uid(), company_id)
);

create policy "admins update devices" on public.devices
for update to authenticated
using (public.is_admin_of(auth.uid(), company_id))
with check (public.is_admin_of(auth.uid(), company_id));

create policy "admins delete devices" on public.devices
for delete to authenticated
using (public.is_admin_of(auth.uid(), company_id));

-- device_recipes (scoped via parent device)
create policy "view recipes" on public.device_recipes
for select to authenticated
using (exists (
  select 1 from public.devices d
  where d.id = device_id
    and d.company_id = public.get_user_company(auth.uid())
));

create policy "admins manage recipes" on public.device_recipes
for all to authenticated
using (exists (
  select 1 from public.devices d
  where d.id = device_id
    and public.is_admin_of(auth.uid(), d.company_id)
))
with check (exists (
  select 1 from public.devices d
  where d.id = device_id
    and public.is_admin_of(auth.uid(), d.company_id)
));

-- device_dependencies
create policy "view deps" on public.device_dependencies
for select to authenticated
using (exists (
  select 1 from public.devices d
  where d.id = device_id
    and d.company_id = public.get_user_company(auth.uid())
));

create policy "admins manage deps" on public.device_dependencies
for all to authenticated
using (exists (
  select 1 from public.devices d
  where d.id = device_id
    and public.is_admin_of(auth.uid(), d.company_id)
))
with check (exists (
  select 1 from public.devices d
  where d.id = device_id
    and public.is_admin_of(auth.uid(), d.company_id)
));

-- inventory_logs
create policy "view logs" on public.inventory_logs
for select to authenticated
using (company_id = public.get_user_company(auth.uid()));

create policy "insert logs in own company" on public.inventory_logs
for insert to authenticated
with check (company_id = public.get_user_company(auth.uid()));

-- =========================================================
-- BUSINESS LOGIC RPCs
-- =========================================================

-- Real-time build capacity for a device (recursive across dependencies)
create or replace function public.build_capacity(_device_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cap integer := 2147483647;
  rec record;
  dep_cap integer;
begin
  -- limited by components
  for rec in
    select r.quantity, c.stock_count
    from public.device_recipes r
    join public.components c on c.id = r.component_id
    where r.device_id = _device_id
  loop
    cap := least(cap, floor(rec.stock_count::numeric / rec.quantity)::int);
  end loop;

  -- limited by dependent devices' assembled stock
  for rec in
    select dd.quantity, d.assembled_stock
    from public.device_dependencies dd
    join public.devices d on d.id = dd.depends_on_device_id
    where dd.device_id = _device_id
  loop
    cap := least(cap, floor(rec.assembled_stock::numeric / rec.quantity)::int);
  end loop;

  if cap = 2147483647 then
    return 0;
  end if;
  return greatest(cap, 0);
end;
$$;

-- Assemble device(s): consume components, increase assembled_stock
create or replace function public.assemble_device(_device_id uuid, _qty integer, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_user uuid := auth.uid();
  v_device_name text;
  rec record;
begin
  if _qty is null or _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select company_id, name into v_company, v_device_name
  from public.devices where id = _device_id;

  if v_company is null then
    raise exception 'Device not found';
  end if;

  if v_company <> public.get_user_company(v_user) then
    raise exception 'Forbidden';
  end if;

  -- Validate components stock
  for rec in
    select r.component_id, r.quantity * _qty as needed, c.stock_count, c.name
    from public.device_recipes r
    join public.components c on c.id = r.component_id
    where r.device_id = _device_id
  loop
    if rec.stock_count < rec.needed then
      raise exception 'Insufficient component % (need %, have %)', rec.name, rec.needed, rec.stock_count;
    end if;
  end loop;

  -- Deduct components
  for rec in
    select r.component_id, r.quantity * _qty as needed, c.name
    from public.device_recipes r
    join public.components c on c.id = r.component_id
    where r.device_id = _device_id
  loop
    update public.components set stock_count = stock_count - rec.needed, updated_at = now()
    where id = rec.component_id;

    insert into public.inventory_logs (company_id, user_id, item_type, item_id, item_name, action, quantity, note)
    values (v_company, v_user, 'component', rec.component_id, rec.name, 'out', rec.needed, coalesce(_note, 'Assembly: ' || v_device_name));
  end loop;

  -- Increase assembled stock
  update public.devices set assembled_stock = assembled_stock + _qty, updated_at = now()
  where id = _device_id;

  insert into public.inventory_logs (company_id, user_id, item_type, item_id, item_name, action, quantity, note)
  values (v_company, v_user, 'device', _device_id, v_device_name, 'assemble', _qty, _note);
end;
$$;

-- Deliver device(s): deduct assembled stock, deduct dependent devices, log
create or replace function public.deliver_device(_device_id uuid, _qty integer, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_user uuid := auth.uid();
  v_device_name text;
  v_assembled int;
  rec record;
begin
  if _qty is null or _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select company_id, name, assembled_stock
    into v_company, v_device_name, v_assembled
  from public.devices where id = _device_id;

  if v_company is null then
    raise exception 'Device not found';
  end if;

  if v_company <> public.get_user_company(v_user) then
    raise exception 'Forbidden';
  end if;

  if v_assembled < _qty then
    raise exception 'Not enough assembled stock of % (need %, have %)', v_device_name, _qty, v_assembled;
  end if;

  -- Validate dependencies
  for rec in
    select dd.depends_on_device_id, dd.quantity * _qty as needed, d.assembled_stock, d.name
    from public.device_dependencies dd
    join public.devices d on d.id = dd.depends_on_device_id
    where dd.device_id = _device_id
  loop
    if rec.assembled_stock < rec.needed then
      raise exception 'Insufficient dependency device % (need %, have %)', rec.name, rec.needed, rec.assembled_stock;
    end if;
  end loop;

  -- Deduct dependencies
  for rec in
    select dd.depends_on_device_id, dd.quantity * _qty as needed, d.name
    from public.device_dependencies dd
    join public.devices d on d.id = dd.depends_on_device_id
    where dd.device_id = _device_id
  loop
    update public.devices set assembled_stock = assembled_stock - rec.needed, updated_at = now()
    where id = rec.depends_on_device_id;

    insert into public.inventory_logs (company_id, user_id, item_type, item_id, item_name, action, quantity, note)
    values (v_company, v_user, 'device', rec.depends_on_device_id, rec.name, 'out', rec.needed,
            coalesce(_note, 'Bundled with ' || v_device_name));
  end loop;

  -- Deduct main device assembled stock
  update public.devices set assembled_stock = assembled_stock - _qty, updated_at = now()
  where id = _device_id;

  insert into public.inventory_logs (company_id, user_id, item_type, item_id, item_name, action, quantity, note)
  values (v_company, v_user, 'device', _device_id, v_device_name, 'deliver', _qty, _note);
end;
$$;

-- Adjust component stock (in/out)
create or replace function public.adjust_component(_component_id uuid, _delta integer, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_user uuid := auth.uid();
  v_name text;
  v_stock int;
begin
  if _delta = 0 then return; end if;

  select company_id, name, stock_count into v_company, v_name, v_stock
  from public.components where id = _component_id;

  if v_company is null then
    raise exception 'Component not found';
  end if;

  if v_company <> public.get_user_company(v_user) then
    raise exception 'Forbidden';
  end if;

  if v_stock + _delta < 0 then
    raise exception 'Insufficient stock for %', v_name;
  end if;

  update public.components set stock_count = stock_count + _delta, updated_at = now()
  where id = _component_id;

  insert into public.inventory_logs (company_id, user_id, item_type, item_id, item_name, action, quantity, note)
  values (v_company, v_user, 'component', _component_id, v_name,
          case when _delta > 0 then 'in'::log_action else 'out'::log_action end,
          abs(_delta), _note);
end;
$$;

-- =========================================================
-- STORAGE BUCKET
-- =========================================================
insert into storage.buckets (id, name, public)
values ('component-images', 'component-images', true)
on conflict (id) do nothing;

create policy "public read component images"
on storage.objects for select
using (bucket_id = 'component-images');

create policy "auth upload component images"
on storage.objects for insert to authenticated
with check (bucket_id = 'component-images');

create policy "auth update component images"
on storage.objects for update to authenticated
using (bucket_id = 'component-images');

create policy "auth delete component images"
on storage.objects for delete to authenticated
using (bucket_id = 'component-images');
