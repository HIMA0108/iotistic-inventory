
-- 1. Add defective_count to components
ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS defective_count integer NOT NULL DEFAULT 0;

-- 2. Add 'defective' to log_action enum
ALTER TYPE public.log_action ADD VALUE IF NOT EXISTS 'defective';

-- 3. Update signup trigger: only first user becomes admin, others get NO role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  default_company uuid := '00000000-0000-0000-0000-000000000001';
  user_count int;
begin
  insert into public.profiles (id, company_id, full_name, email)
  values (new.id, default_company, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email);

  select count(*) into user_count from public.profiles;

  -- Only the very first user gets admin automatically.
  -- Everyone else stays role-less ("pending") until an admin assigns one.
  if user_count <= 1 then
    insert into public.user_roles (user_id, company_id, role)
    values (new.id, default_company, 'admin');
  end if;

  return new;
end;
$function$;

-- 4. Helper: does the user have ANY role?
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id);
$$;

-- 5. RPC: mark component stock as defective
CREATE OR REPLACE FUNCTION public.mark_component_defective(_component_id uuid, _qty integer, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_company uuid;
  v_user uuid := auth.uid();
  v_name text;
  v_stock int;
begin
  if _qty is null or _qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select company_id, name, stock_count into v_company, v_name, v_stock
  from public.components where id = _component_id;

  if v_company is null then
    raise exception 'Component not found';
  end if;

  if v_company <> public.get_user_company(v_user) then
    raise exception 'Forbidden';
  end if;

  if v_stock < _qty then
    raise exception 'Insufficient stock for % (have %, need %)', v_name, v_stock, _qty;
  end if;

  update public.components
  set stock_count = stock_count - _qty,
      defective_count = defective_count + _qty,
      updated_at = now()
  where id = _component_id;

  insert into public.inventory_logs (company_id, user_id, item_type, item_id, item_name, action, quantity, note)
  values (v_company, v_user, 'component', _component_id, v_name, 'defective', _qty, coalesce(_note, 'Marked defective'));
end;
$$;

-- 6. RPC: admin sets/removes a user's role
CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_caller uuid := auth.uid();
  v_company uuid;
begin
  v_company := public.get_user_company(_user_id);
  if v_company is null then
    raise exception 'Target user not found';
  end if;
  if not public.is_admin_of(v_caller, v_company) then
    raise exception 'Only admins can change roles';
  end if;

  delete from public.user_roles where user_id = _user_id and company_id = v_company;
  insert into public.user_roles (user_id, company_id, role)
  values (_user_id, v_company, _role);
end;
$$;

CREATE OR REPLACE FUNCTION public.remove_user_role(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_caller uuid := auth.uid();
  v_company uuid;
begin
  v_company := public.get_user_company(_user_id);
  if v_company is null then
    raise exception 'Target user not found';
  end if;
  if not public.is_admin_of(v_caller, v_company) then
    raise exception 'Only admins can change roles';
  end if;

  delete from public.user_roles where user_id = _user_id and company_id = v_company;
end;
$$;
