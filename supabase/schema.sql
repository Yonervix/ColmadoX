create extension if not exists pgcrypto;

create type rol_tipo as enum ('jefe', 'empleado');
create type producto_tipo as enum ('unidad', 'paquete', 'caja');
create type venta_tipo as enum ('contado', 'fiado');
create type movimiento_concepto as enum ('compra', 'venta', 'merma', 'ajuste', 'conteo', 'anulacion');
create type caja_estado as enum ('abierta', 'cerrada');

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  nombre text not null default '',
  rol rol_tipo not null default 'empleado',
  created_at timestamptz not null default now()
);

create table public.categorias (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table public.productos (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  categoria_id bigint references public.categorias on delete set null,
  tipo producto_tipo not null default 'unidad',
  foto_url text,
  stock integer not null default 0,
  stock_minimo integer not null default 0,
  precio_compra numeric(10,2) not null default 0,
  precio_venta numeric(10,2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_productos_nombre on public.productos (nombre);

create table public.movimientos_stock (
  id bigint generated always as identity primary key,
  producto_id uuid not null references public.productos on delete cascade,
  concepto movimiento_concepto not null,
  cantidad integer not null,
  referencia uuid,
  fecha timestamptz not null default now(),
  created_by uuid references auth.users on delete set null
);

create table public.compras (
  id uuid default gen_random_uuid() primary key,
  proveedor text not null,
  fecha timestamptz not null default now(),
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users on delete set null
);

create table public.compra_items (
  id bigint generated always as identity primary key,
  compra_id uuid not null references public.compras on delete cascade,
  producto_id uuid not null references public.productos on delete restrict,
  cantidad integer not null,
  costo_unitario numeric(10,2) not null
);

create table public.clientes (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  telefono text,
  created_at timestamptz not null default now()
);

create table public.ventas (
  id uuid default gen_random_uuid() primary key,
  numero integer not null,
  tipo venta_tipo not null default 'contado',
  cliente_id uuid references public.clientes on delete set null,
  total numeric(10,2) not null,
  descuento numeric(10,2) not null default 0,
  pago_con numeric(10,2),
  cambio numeric(10,2),
  anulada boolean not null default false,
  motivo_anulacion text,
  anulada_por uuid references auth.users on delete set null,
  anulada_at timestamptz,
  created_at timestamptz not null default now(),
  empleado_id uuid references auth.users on delete set null
);

create table public.venta_items (
  id bigint generated always as identity primary key,
  venta_id uuid not null references public.ventas on delete cascade,
  producto_id uuid not null references public.productos on delete restrict,
  cantidad integer not null,
  precio_venta numeric(10,2) not null,
  subtotal numeric(10,2) not null
);

create table public.pagos_fiado (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid not null references public.clientes on delete cascade,
  monto numeric(10,2) not null,
  fecha timestamptz not null default now(),
  empleado_id uuid references auth.users on delete set null
);

create table public.gastos (
  id uuid default gen_random_uuid() primary key,
  descripcion text not null,
  monto numeric(10,2) not null,
  fecha timestamptz not null default now(),
  empleado_id uuid references auth.users on delete set null
);

create table public.mermas (
  id uuid default gen_random_uuid() primary key,
  producto_id uuid not null references public.productos on delete restrict,
  cantidad integer not null,
  motivo text not null,
  origen text not null default 'manual',
  conteo_id uuid,
  fecha timestamptz not null default now(),
  registrada_por uuid references auth.users on delete set null
);

create table public.conteos (
  id uuid default gen_random_uuid() primary key,
  estado text not null default 'en_curso',
  fecha timestamptz not null default now(),
  cerrado_at timestamptz,
  created_by uuid references auth.users on delete set null,
  cerrado_por uuid references auth.users on delete set null
);

create table public.conteo_items (
  id bigint generated always as identity primary key,
  conteo_id uuid not null references public.conteos on delete cascade,
  producto_id uuid not null references public.productos on delete cascade,
  stock_sistema integer not null,
  stock_fisico integer not null,
  diferencia integer not null
);

create table public.caja (
  id uuid default gen_random_uuid() primary key,
  fecha date not null unique,
  fondo_inicial numeric(10,2) not null default 0,
  estado caja_estado not null default 'abierta',
  esperado numeric(10,2),
  dinero_fisico numeric(10,2),
  diferencia numeric(10,2),
  ganancia numeric(10,2),
  abierta_por uuid references auth.users on delete set null,
  abierta_at timestamptz not null default now(),
  cerrada_por uuid references auth.users on delete set null,
  cerrada_at timestamptz
);

insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict do nothing;

create policy "Fotos publicas" on storage.objects
  for select to public using (bucket_id = 'productos');

create policy "Subir fotos productos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos');

create policy "Actualizar fotos productos" on storage.objects
  for update to authenticated
  using (bucket_id = 'productos') with check (bucket_id = 'productos');

create policy "Eliminar fotos productos" on storage.objects
  for delete to authenticated using (bucket_id = 'productos');

create or replace function public.is_jefe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and rol = 'jefe'
  );
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', 'Empleado'),
    coalesce((new.raw_user_meta_data->>'rol')::rol_tipo, 'empleado')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.movimientos_stock enable row level security;
alter table public.compras enable row level security;
alter table public.compra_items enable row level security;
alter table public.clientes enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_items enable row level security;
alter table public.pagos_fiado enable row level security;
alter table public.gastos enable row level security;
alter table public.mermas enable row level security;
alter table public.conteos enable row level security;
alter table public.conteo_items enable row level security;
alter table public.caja enable row level security;

create policy "Perfil propio" on public.profiles
  for select using (auth.uid() = id);
create policy "Jefe edita perfiles" on public.profiles
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.categorias
  for select to authenticated using (true);
create policy "Jefe gestiona categorias" on public.categorias
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.productos
  for select to authenticated using (true);
create policy "Jefe gestiona productos" on public.productos
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.movimientos_stock
  for select to authenticated using (true);
create policy "Registro autenticado" on public.movimientos_stock
  for insert to authenticated with check (true);

create policy "Lectura general" on public.compras
  for select to authenticated using (true);
create policy "Jefe gestiona compras" on public.compras
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.compra_items
  for select to authenticated using (true);
create policy "Jefe gestiona items de compra" on public.compra_items
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.clientes
  for select to authenticated using (true);
create policy "Registro autenticado clientes" on public.clientes
  for insert to authenticated with check (true);

create policy "Lectura general" on public.ventas
  for select to authenticated using (true);
create policy "Registro autenticado ventas" on public.ventas
  for insert to authenticated with check (true);
create policy "Jefe anula ventas" on public.ventas
  for update to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.venta_items
  for select to authenticated using (true);
create policy "Registro autenticado items" on public.venta_items
  for insert to authenticated with check (true);

create policy "Lectura general" on public.pagos_fiado
  for select to authenticated using (true);
create policy "Registro autenticado pagos" on public.pagos_fiado
  for insert to authenticated with check (true);

create policy "Lectura general" on public.gastos
  for select to authenticated using (true);
create policy "Registro autenticado gastos" on public.gastos
  for insert to authenticated with check (true);

create policy "Lectura general" on public.mermas
  for select to authenticated using (true);
create policy "Jefe gestiona mermas" on public.mermas
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.conteos
  for select to authenticated using (true);
create policy "Jefe gestiona conteos" on public.conteos
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.conteo_items
  for select to authenticated using (true);
create policy "Jefe gestiona items de conteo" on public.conteo_items
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create policy "Lectura general" on public.caja
  for select to authenticated using (true);
create policy "Jefe gestiona caja" on public.caja
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create or replace function public.idx_ventas_numero() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(numero), 0) + 1 into new.numero
  from public.ventas;
  return new;
end;
$$;

create trigger asignar_numero_venta
  before insert on public.ventas
  for each row execute procedure public.idx_ventas_numero();
create or replace view public.deudores
with (security_invoker = true)
as
select
  c.id,
  c.nombre,
  c.telefono,
  coalesce(sum(v.total) filter (where v.tipo = 'fiado' and not v.anulada), 0)
    - coalesce((select sum(p.monto) from public.pagos_fiado p where p.cliente_id = c.id), 0) as saldo,
  max(v.created_at) filter (where v.tipo = 'fiado' and not v.anulada) as ultima_venta
from public.clientes c
left join public.ventas v on v.cliente_id = c.id
group by c.id, c.nombre, c.telefono;

create or replace view public.productos_venta
with (security_invoker = true)
as
select id, nombre, tipo, foto_url, stock, stock_minimo, precio_venta
from public.productos
where activo = true;

create or replace function public.registrar_venta(
  p_tipo venta_tipo,
  p_cliente_id uuid,
  p_pago_con numeric,
  p_descuento numeric,
  p_items jsonb
) returns public.ventas
language plpgsql security definer set search_path = public
as $$
declare
  v_venta public.ventas;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad integer;
  v_precio numeric(10,2);
  v_total numeric(10,2) := 0;
  v_stock_actual integer;
  v_caja_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para vender';
  end if;

  select id into v_caja_id
  from public.caja
  where fecha = public.fecha_local()
    and estado = 'abierta'
  order by abierta_at desc
  limit 1;

  if v_caja_id is null then
    raise exception 'Debes abrir la caja de hoy antes de vender';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una venta debe incluir productos';
  end if;

  if p_tipo = 'fiado' and p_cliente_id is null then
    raise exception 'Para una venta a fiado debes elegir un cliente';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad <= 0 then
      raise exception 'Las cantidades deben ser positivas';
    end if;

    select stock into v_stock_actual from public.productos where id = v_producto_id;
    if v_stock_actual is null then
      raise exception 'Producto no encontrado';
    end if;
    if v_stock_actual < v_cantidad then
      raise exception 'Stock insuficiente para uno de los productos';
    end if;

    select precio_venta into v_precio from public.productos where id = v_producto_id;
    v_total := v_total + (v_precio * v_cantidad);
  end loop;

  v_total := v_total - coalesce(p_descuento, 0);

  insert into public.ventas (caja_id, tipo, cliente_id, total, descuento, pago_con, cambio, empleado_id)
  values (
    v_caja_id,
    p_tipo,
    p_cliente_id,
    v_total,
    coalesce(p_descuento, 0),
    case when p_tipo = 'contado' then p_pago_con else null end,
    case when p_tipo = 'contado' and p_pago_con is not null then greatest(p_pago_con - v_total, 0) else 0 end,
    auth.uid()
  )
  returning * into v_venta;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_precio := (v_item->>'precio_venta')::numeric;

    insert into public.venta_items (venta_id, producto_id, cantidad, precio_venta, subtotal)
    values (v_venta.id, v_producto_id, v_cantidad, v_precio, v_precio * v_cantidad);

    update public.productos
    set stock = stock - v_cantidad,
        updated_at = now()
    where id = v_producto_id;

    insert into public.movimientos_stock (producto_id, concepto, cantidad, referencia, created_by)
    values (v_producto_id, 'venta', v_cantidad, v_venta.id, auth.uid());
  end loop;

  return v_venta;
end;
$$;

drop policy if exists "Lectura general" on public.compras;
create policy "Jefe lee compras" on public.compras
  for select to authenticated using (public.is_jefe());

drop policy if exists "Lectura general" on public.compra_items;
create policy "Jefe lee items de compra" on public.compra_items
  for select to authenticated using (public.is_jefe());

drop policy if exists "Lectura general" on public.caja;
create policy "Jefe lee caja" on public.caja
  for select to authenticated using (public.is_jefe());

create or replace function public.registrar_merma(
  p_producto_id uuid,
  p_cantidad integer,
  p_motivo text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_stock integer;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede registrar mermas';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser positiva';
  end if;

  select stock into v_stock from public.productos where id = p_producto_id;
  if v_stock is null then
    raise exception 'Producto no encontrado';
  end if;
  if v_stock < p_cantidad then
    raise exception 'No hay stock suficiente para la merma';
  end if;

  insert into public.mermas (producto_id, cantidad, motivo, registrada_por)
  values (p_producto_id, p_cantidad, p_motivo, auth.uid());

  update public.productos
  set stock = stock - p_cantidad,
      updated_at = now()
  where id = p_producto_id;

  insert into public.movimientos_stock (producto_id, concepto, cantidad, created_by)
  values (p_producto_id, 'merma', -p_cantidad, auth.uid());

  return;
end;
$$;

create or replace function public.cerrar_conteo(
  p_conteo_id uuid,
  p_items jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_item jsonb;
  v_producto_id uuid;
  v_sistema integer;
  v_fisico integer;
  v_diferencia integer;
  v_conteo record;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede cerrar un conteo';
  end if;

  select * into v_conteo from public.conteos where id = p_conteo_id;
  if v_conteo.id is null then
    raise exception 'Conteo no encontrado';
  end if;
  if v_conteo.estado = 'cerrado' then
    raise exception 'Este conteo ya fue cerrado';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_sistema := (v_item->>'stock_sistema')::int;
    v_fisico := (v_item->>'stock_fisico')::int;
    v_diferencia := v_fisico - v_sistema;

    insert into public.conteo_items (conteo_id, producto_id, stock_sistema, stock_fisico, diferencia)
    values (p_conteo_id, v_producto_id, v_sistema, v_fisico, v_diferencia);

    if v_diferencia < 0 then
      insert into public.mermas (producto_id, cantidad, motivo, origen, conteo_id, registrada_por)
      values (v_producto_id, -v_diferencia, 'Faltante segun conteo fisico', 'conteo', p_conteo_id, auth.uid());
    end if;

    if v_diferencia <> 0 then
      update public.productos
      set stock = stock + v_diferencia,
          updated_at = now()
      where id = v_producto_id;

      insert into public.movimientos_stock (producto_id, concepto, cantidad, referencia, created_by)
      values (v_producto_id, 'conteo', v_diferencia, p_conteo_id, auth.uid());
    end if;
  end loop;

  update public.conteos
  set estado = 'cerrado',
      cerrado_at = now(),
      cerrado_por = auth.uid()
  where id = p_conteo_id;

  return;
end;
$$;

create or replace function public.fecha_local() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'America/Santo_Domingo')::date;
$$;

create or replace function public.abrir_caja(p_fondo_inicial numeric)
returns public.caja
language plpgsql security definer set search_path = public as $$
declare
  v_caja public.caja;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede abrir la caja';
  end if;
  if p_fondo_inicial is null or p_fondo_inicial < 0 then
    raise exception 'El fondo inicial debe ser un monto valido';
  end if;

  select * into v_caja
  from public.caja
  where fecha = public.fecha_local()
    and estado = 'abierta'
  order by abierta_at desc
  limit 1;
  if v_caja.id is not null then
    raise exception 'Ya hay una caja abierta para hoy';
  end if;

  insert into public.caja (fecha, fondo_inicial, abierta_por)
  values (public.fecha_local(), p_fondo_inicial, auth.uid())
  returning * into v_caja;

  return v_caja;
end;
$$;

create or replace function public.resumen_caja() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_caja record;
  v_contado numeric(10,2);
  v_cobros numeric(10,2);
  v_gastos numeric(10,2);
  v_ganancia numeric(10,2);
  v_esperado numeric(10,2);
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede ver la caja';
  end if;

  select * into v_caja
  from public.caja
  where fecha = public.fecha_local()
  order by (estado = 'abierta') desc, abierta_at desc
  limit 1;

  if v_caja.id is null then
    return jsonb_build_object('caja', null);
  end if;

  if v_caja.estado = 'cerrada' then
    return jsonb_build_object(
      'caja', to_jsonb(v_caja),
      'ventas_contado', 0,
      'cobros_fiado', 0,
      'gastos', 0,
      'ganancia', coalesce(v_caja.ganancia, 0),
      'esperado', coalesce(v_caja.esperado, 0)
    );
  end if;

  select coalesce(sum(total), 0) into v_contado
  from public.ventas
  where caja_id = v_caja.id
    and tipo = 'contado'
    and not anulada;

  select coalesce(sum(monto), 0) into v_cobros
  from public.pagos_fiado
  where caja_id = v_caja.id;

  select coalesce(sum(monto), 0) into v_gastos
  from public.gastos
  where caja_id = v_caja.id;

  select coalesce(sum((vi.precio_venta - p.precio_compra) * vi.cantidad), 0) into v_ganancia
  from public.venta_items vi
  join public.ventas v on v.id = vi.venta_id
  join public.productos p on p.id = vi.producto_id
  where v.caja_id = v_caja.id
    and not v.anulada;

  v_esperado := v_caja.fondo_inicial + v_contado + v_cobros - v_gastos;

  return jsonb_build_object(
    'caja', to_jsonb(v_caja),
    'ventas_contado', v_contado,
    'cobros_fiado', v_cobros,
    'gastos', v_gastos,
    'ganancia', v_ganancia,
    'esperado', v_esperado
  );
end;
$$;

create or replace function public.anular_venta(p_venta_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_venta record;
  v_item record;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede anular ventas';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id;
  if v_venta.id is null then
    raise exception 'Venta no encontrada';
  end if;
  if v_venta.anulada then
    raise exception 'La venta ya esta anulada';
  end if;
  if (v_venta.created_at at time zone 'America/Santo_Domingo')::date <> public.fecha_local() then
    raise exception 'Solo puedes anular ventas del dia de hoy';
  end if;

  update public.ventas
  set anulada = true,
      anulada_por = auth.uid(),
      anulada_at = now()
  where id = p_venta_id;

  for v_item in
    select vi.producto_id, vi.cantidad
    from public.venta_items vi
    where vi.venta_id = p_venta_id
  loop
    update public.productos
    set stock = stock + v_item.cantidad,
        updated_at = now()
    where id = v_item.producto_id;

    insert into public.movimientos_stock (producto_id, concepto, cantidad, referencia, created_by)
    values (v_item.producto_id, 'anulacion', v_item.cantidad, p_venta_id, auth.uid());
  end loop;

  return;
end;
$$;

create or replace function public.cerrar_caja(p_dinero_fisico numeric)
returns public.caja
language plpgsql security definer set search_path = public as $$
declare
  v_caja record;
  v_contado numeric(10,2);
  v_cobros numeric(10,2);
  v_gastos numeric(10,2);
  v_ganancia numeric(10,2);
  v_esperado numeric(10,2);
  v_diferencia numeric(10,2);
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede cerrar la caja';
  end if;
  if p_dinero_fisico is null or p_dinero_fisico < 0 then
    raise exception 'Indica el dinero fisico para el arqueo';
  end if;

  select * into v_caja
  from public.caja
  where fecha = public.fecha_local()
    and estado = 'abierta'
  order by abierta_at desc
  limit 1;
  if v_caja.id is null then
    raise exception 'No hay caja abierta para hoy';
  end if;

  select coalesce(sum(total), 0) into v_contado
  from public.ventas
  where caja_id = v_caja.id
    and tipo = 'contado'
    and not anulada;

  select coalesce(sum(monto), 0) into v_cobros
  from public.pagos_fiado
  where caja_id = v_caja.id;

  select coalesce(sum(monto), 0) into v_gastos
  from public.gastos
  where caja_id = v_caja.id;

  select coalesce(sum((vi.precio_venta - p.precio_compra) * vi.cantidad), 0) into v_ganancia
  from public.venta_items vi
  join public.ventas v on v.id = vi.venta_id
  join public.productos p on p.id = vi.producto_id
  where v.caja_id = v_caja.id
    and not v.anulada;

  v_esperado := v_caja.fondo_inicial + v_contado + v_cobros - v_gastos;
  v_diferencia := p_dinero_fisico - v_esperado;

  update public.caja
  set estado = 'cerrada',
      esperado = v_esperado,
      dinero_fisico = p_dinero_fisico,
      diferencia = v_diferencia,
      ganancia = v_ganancia,
      cerrada_por = auth.uid(),
      cerrada_at = now()
  where id = v_caja.id
  returning * into v_caja;

  return v_caja;
end;
$$;

create or replace function public.caja_abierta_hoy() returns uuid
language sql security definer set search_path = public as $$
  select id
  from public.caja
  where fecha = public.fecha_local()
    and estado = 'abierta'
  order by abierta_at desc
  limit 1;
$$;

create or replace function public.lista_ventas_caja(p_caja_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_resultado jsonb;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede ver la caja';
  end if;

  if p_caja_id is null then
    raise exception 'Indica la caja';
  end if;

  select coalesce(jsonb_agg(j order by j->>'created_at' desc), '[]'::jsonb) into v_resultado
  from (
    select jsonb_build_object(
      'id', v.id,
      'numero', v.numero,
      'tipo', v.tipo,
      'total', v.total,
      'anulada', v.anulada,
      'created_at', v.created_at,
      'cliente', c.nombre,
      'ganancia', coalesce(sum((vi.precio_venta - p.precio_compra) * vi.cantidad), 0)
    ) as j
    from public.ventas v
    left join public.clientes c on c.id = v.cliente_id
    join public.venta_items vi on vi.venta_id = v.id
    join public.productos p on p.id = vi.producto_id
    where v.caja_id = p_caja_id
    group by v.id, v.numero, v.tipo, v.total, v.anulada, v.created_at, c.nombre
  ) s;

  return v_resultado;
end;
$$;

create or replace function public.registrar_compra(
  p_proveedor text,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_compra_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad integer;
  v_costo numeric(10,2);
  v_total numeric(10,2) := 0;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede registrar compras';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe incluir al menos un producto';
  end if;

  select sum(((v_item->>'cantidad')::int) * ((v_item->>'costo_unitario')::numeric))
  into v_total
  from (
    select jsonb_array_elements(p_items) as v_item
  ) t;

  insert into public.compras (proveedor, fecha, total, created_by)
  values (p_proveedor, now(), v_total, auth.uid())
  returning id into v_compra_id;

  for v_item in select jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_costo := (v_item->>'costo_unitario')::numeric;

    insert into public.compra_items (compra_id, producto_id, cantidad, costo_unitario)
    values (v_compra_id, v_producto_id, v_cantidad, v_costo);

    update public.productos
    set stock = stock + v_cantidad,
        precio_compra = v_costo,
        updated_at = now()
    where id = v_producto_id;

    insert into public.movimientos_stock (producto_id, concepto, cantidad, referencia, created_by)
    values (v_producto_id, 'compra', v_cantidad, v_compra_id, auth.uid());
  end loop;

  return v_compra_id;
end;
$$;