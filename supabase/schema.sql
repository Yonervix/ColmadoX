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