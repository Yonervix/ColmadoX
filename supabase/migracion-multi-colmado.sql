-- ==================== MIGRACION MULTI-COLMADO ====================
-- Ejecutar en Supabase > SQL Editor como UN solo bloque, de principio a fin.
drop trigger if exists asignar_numero_venta on public.ventas;

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
select id, nombre, tipo, foto_url, stock, stock_minimo, precio_venta, unidades_por_paquete
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
  v_tipo text;
  v_por_paquete numeric(10,2);
  v_caja_id uuid;
  v_colmado uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n para vender';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado para vender';
  end if;

  select id into v_caja_id
  from public.caja
  where fecha = public.fecha_local()
    and estado = 'abierta'
    and colmado_id = v_colmado
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

  if p_tipo = 'fiado' then
    if not exists (
      select 1 from public.clientes
      where id = p_cliente_id and colmado_id = v_colmado
    ) then
      raise exception 'Cliente no encontrado';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad <= 0 then
      raise exception 'Las cantidades deben ser positivas';
    end if;

    select stock, tipo, unidades_por_paquete into v_stock_actual, v_tipo, v_por_paquete
    from public.productos where id = v_producto_id and colmado_id = v_colmado;
    if v_stock_actual is null then
      raise exception 'Producto no encontrado';
    end if;

    if not (v_tipo in ('paquete', 'caja') and coalesce(v_por_paquete, 0) <= 0) then
      if v_stock_actual < v_cantidad then
        raise exception 'Stock insuficiente para uno de los productos';
      end if;
    end if;

    select precio_venta into v_precio from public.productos where id = v_producto_id and colmado_id = v_colmado;
    v_total := v_total + (v_precio * v_cantidad);
  end loop;

  v_total := v_total - coalesce(p_descuento, 0);

  insert into public.ventas (caja_id, tipo, cliente_id, total, descuento, pago_con, cambio, empleado_id, colmado_id)
  values (
    v_caja_id,
    p_tipo,
    p_cliente_id,
    v_total,
    coalesce(p_descuento, 0),
    case when p_tipo = 'contado' then p_pago_con else null end,
    case when p_tipo = 'contado' and p_pago_con is not null then greatest(p_pago_con - v_total, 0) else 0 end,
    auth.uid(),
    v_colmado
  )
  returning * into v_venta;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_precio := (v_item->>'precio_venta')::numeric;

    insert into public.venta_items (venta_id, producto_id, cantidad, precio_venta, subtotal, colmado_id)
    values (v_venta.id, v_producto_id, v_cantidad, v_precio, v_precio * v_cantidad, v_colmado);

    select tipo, unidades_por_paquete into v_tipo, v_por_paquete
    from public.productos where id = v_producto_id and colmado_id = v_colmado;

    if not (v_tipo in ('paquete', 'caja') and coalesce(v_por_paquete, 0) <= 0) then
      update public.productos
      set stock = stock - v_cantidad,
          updated_at = now()
      where id = v_producto_id;

      insert into public.movimientos_stock (producto_id, concepto, cantidad, referencia, created_by, colmado_id)
      values (v_producto_id, 'venta', v_cantidad, v_venta.id, auth.uid(), v_colmado);
    end if;
  end loop;

  return v_venta;
end;
$$;

drop policy if exists "Lectura general" on public.compras;
create or replace function public.registrar_merma(
  p_producto_id uuid,
  p_cantidad integer,
  p_motivo text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_stock integer;
  v_colmado uuid;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede registrar mermas';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser positiva';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select stock into v_stock from public.productos where id = p_producto_id and colmado_id = v_colmado;
  if v_stock is null then
    raise exception 'Producto no encontrado';
  end if;
  if v_stock < p_cantidad then
    raise exception 'No hay stock suficiente para la merma';
  end if;

  insert into public.mermas (producto_id, cantidad, motivo, registrada_por, colmado_id)
  values (p_producto_id, p_cantidad, p_motivo, auth.uid(), v_colmado);

  update public.productos
  set stock = stock - p_cantidad,
      updated_at = now()
  where id = p_producto_id;

  insert into public.movimientos_stock (producto_id, concepto, cantidad, created_by, colmado_id)
  values (p_producto_id, 'merma', -p_cantidad, auth.uid(), v_colmado);

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
  v_colmado uuid;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede cerrar un conteo';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select * into v_conteo from public.conteos where id = p_conteo_id and colmado_id = v_colmado;
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

    insert into public.conteo_items (conteo_id, producto_id, stock_sistema, stock_fisico, diferencia, colmado_id)
    values (p_conteo_id, v_producto_id, v_sistema, v_fisico, v_diferencia, v_colmado);

    if v_diferencia < 0 then
      insert into public.mermas (producto_id, cantidad, motivo, origen, conteo_id, registrada_por, colmado_id)
      values (v_producto_id, -v_diferencia, 'Faltante segun conteo fisico', 'conteo', p_conteo_id, auth.uid(), v_colmado);
    end if;

    if v_diferencia <> 0 then
      update public.productos
      set stock = stock + v_diferencia,
          updated_at = now()
      where id = v_producto_id;

      insert into public.movimientos_stock (producto_id, concepto, cantidad, referencia, created_by, colmado_id)
      values (v_producto_id, 'conteo', v_diferencia, p_conteo_id, auth.uid(), v_colmado);
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
  v_colmado uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n para abrir la caja';
  end if;
  if p_fondo_inicial is null or p_fondo_inicial < 0 then
    raise exception 'El fondo inicial debe ser un monto valido';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select * into v_caja
  from public.caja
  where fecha = public.fecha_local()
    and estado = 'abierta'
    and colmado_id = v_colmado
  order by abierta_at desc
  limit 1;
  if v_caja.id is not null then
    raise exception 'Ya hay una caja abierta para hoy';
  end if;

  insert into public.caja (fecha, fondo_inicial, abierta_por, colmado_id)
  values (public.fecha_local(), p_fondo_inicial, auth.uid(), v_colmado)
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
  v_colmado uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n para ver la caja';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select * into v_caja
  from public.caja
  where fecha = public.fecha_local()
    and colmado_id = v_colmado
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
  v_colmado uuid;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede anular ventas';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id and colmado_id = v_colmado;
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

    insert into public.movimientos_stock (producto_id, concepto, cantidad, referencia, created_by, colmado_id)
    values (v_item.producto_id, 'anulacion', v_item.cantidad, p_venta_id, auth.uid(), v_colmado);
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
  v_colmado uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n para cerrar la caja';
  end if;
  if p_dinero_fisico is null or p_dinero_fisico < 0 then
    raise exception 'Indica el dinero fisico para el arqueo';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select * into v_caja
  from public.caja
  where fecha = public.fecha_local()
    and estado = 'abierta'
    and colmado_id = v_colmado
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

create or replace function public.lista_ventas_caja(p_caja_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_resultado jsonb;
  v_colmado uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n para ver las ventas';
  end if;

  if p_caja_id is null then
    raise exception 'Indica la caja';
  end if;

  v_colmado := public.mi_colmado();
  if not exists (
    select 1 from public.caja
    where id = p_caja_id and colmado_id = v_colmado
  ) then
    raise exception 'Caja no encontrada';
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

create or replace function public.resumen_reportes(p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ventas numeric(10,2);
  v_ganancia numeric(10,2);
  v_gastos numeric(10,2);
  v_mermas numeric(10,2);
  v_cobros numeric(10,2);
  v_tickets integer;
  v_por_dia jsonb;
  v_top jsonb;
  v_por_tipo jsonb;
  v_colmado uuid;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede ver reportes';
  end if;

  if p_desde is null or p_hasta is null then
    raise exception 'Indica el rango de fechas';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select coalesce(sum(total), 0) into v_ventas
  from public.ventas
  where (created_at at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
    and colmado_id = v_colmado
    and not anulada;

  select coalesce(sum((vi.precio_venta - p.precio_compra) * vi.cantidad), 0) into v_ganancia
  from public.venta_items vi
  join public.ventas v on v.id = vi.venta_id
  join public.productos p on p.id = vi.producto_id
  where (v.created_at at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
    and v.colmado_id = v_colmado
    and not v.anulada;

  select coalesce(sum(monto), 0) into v_gastos
  from public.gastos
  where (fecha at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
    and colmado_id = v_colmado;

  select coalesce(sum(p.cantidad * pr.precio_compra), 0) into v_mermas
  from public.mermas p
  join public.productos pr on pr.id = p.producto_id
  where (p.fecha at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
    and p.colmado_id = v_colmado;

  select coalesce(sum(monto), 0) into v_cobros
  from public.pagos_fiado
  where (fecha at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
    and colmado_id = v_colmado;

  select coalesce(sum(1), 0) into v_tickets
  from public.ventas
  where (created_at at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
    and colmado_id = v_colmado
    and not anulada;

  select coalesce(jsonb_agg(fila order by fila->>'fecha'), '[]'::jsonb) into v_por_dia
  from (
    select jsonb_build_object(
      'fecha', to_char((v.created_at at time zone 'America/Santo_Domingo')::date, 'YYYY-MM-DD'),
      'total', coalesce(sum(v.total), 0),
      'ganancia', coalesce(sum((vi.precio_venta - p.precio_compra) * vi.cantidad), 0)
    ) as fila
    from public.ventas v
    join public.venta_items vi on vi.venta_id = v.id
    join public.productos p on p.id = vi.producto_id
    where (v.created_at at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
      and v.colmado_id = v_colmado
      and not v.anulada
    group by (v.created_at at time zone 'America/Santo_Domingo')::date
  ) d;

  select coalesce(jsonb_agg(fila order by (fila->>'total')::numeric desc), '[]'::jsonb) into v_top
  from (
    select jsonb_build_object(
      'nombre', pr.nombre,
      'cantidad', coalesce(sum(vi.cantidad), 0),
      'total', coalesce(sum(vi.subtotal), 0)
    ) as fila
    from public.venta_items vi
    join public.ventas v on v.id = vi.venta_id
    join public.productos pr on pr.id = vi.producto_id
    where (v.created_at at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
      and v.colmado_id = v_colmado
      and not v.anulada
    group by pr.nombre
    limit 8
  ) t;

  select coalesce(jsonb_agg(fila), '[]'::jsonb) into v_por_tipo
  from (
    select jsonb_build_object('tipo', v.tipo, 'total', coalesce(sum(v.total), 0)) as fila
    from public.ventas v
    where (v.created_at at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
      and v.colmado_id = v_colmado
      and not v.anulada
    group by v.tipo
  ) ty;

  return jsonb_build_object(
    'ventas', v_ventas,
    'ganancia', v_ganancia,
    'gastos', v_gastos,
    'mermas_costo', v_mermas,
    'cobros_fiado', v_cobros,
    'tickets', v_tickets,
    'por_dia', v_por_dia,
    'top', v_top,
    'por_tipo', v_por_tipo
  );
end;
$$;

create or replace function public.lista_ventas_rango(p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_resultado jsonb;
  v_colmado uuid;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede ver reportes';
  end if;

  if p_desde is null or p_hasta is null then
    raise exception 'Indica el rango de fechas';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
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
      'ganancia', coalesce(sum((vi.precio_venta - pr.precio_compra) * vi.cantidad), 0)
    ) as j
    from public.ventas v
    left join public.clientes c on c.id = v.cliente_id
    join public.venta_items vi on vi.venta_id = v.id
    join public.productos pr on pr.id = vi.producto_id
    where (v.created_at at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
      and v.colmado_id = v_colmado
    group by v.id, v.numero, v.tipo, v.total, v.anulada, v.created_at, c.nombre
  ) s;

  return v_resultado;
end;
$$;

create or replace function public.registrar_pago(
  p_cliente_id uuid,
  p_monto numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caja_id uuid;
  v_colmado uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n para registrar un pago';
  end if;

  if p_cliente_id is null or p_monto <= 0 then
    raise exception 'Indica un cliente y un monto vÃ¡lido';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  if not exists (
    select 1 from public.clientes
    where id = p_cliente_id and colmado_id = v_colmado
  ) then
    raise exception 'Cliente no encontrado';
  end if;

  select id into v_caja_id
  from public.caja
  where fecha = public.fecha_local() and estado = 'abierta' and colmado_id = v_colmado
  order by abierta_at desc
  limit 1;

  if v_caja_id is null then
    raise exception 'Debes abrir la caja de hoy antes de registrar pagos';
  end if;

  insert into public.pagos_fiado (cliente_id, monto, empleado_id, caja_id, colmado_id)
  values (p_cliente_id, p_monto, auth.uid(), v_caja_id, v_colmado);
end;
$$;

alter table public.ventas add column if not exists caja_id uuid references public.caja on delete set null;
alter table public.pagos_fiado add column if not exists caja_id uuid references public.caja on delete set null;
alter table public.gastos add column if not exists caja_id uuid references public.caja on delete set null;
alter table public.gastos add column if not exists categoria text not null default 'general';

create table if not exists public.presupuestos (
  id uuid default gen_random_uuid() primary key,
  mes date not null,
  categoria text not null,
  monto numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (mes, categoria)
);

alter table public.presupuestos enable row level security;

drop policy if exists "Lectura general presupuestos" on public.presupuestos;
drop policy if exists "Jefe gestiona presupuestos" on public.presupuestos;
create policy "Lectura general presupuestos" on public.presupuestos
  for select to authenticated using (true);
create policy "Jefe gestiona presupuestos" on public.presupuestos
  for all to authenticated using (public.is_jefe()) with check (public.is_jefe());

create or replace function public.registrar_gasto(
  p_descripcion text,
  p_monto numeric,
  p_categoria text default 'general'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caja_id uuid;
  v_colmado uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n para registrar un gasto';
  end if;

  if p_descripcion is null or trim(p_descripcion) = '' then
    raise exception 'Describe el gasto';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  if p_categoria is null or trim(p_categoria) = '' then
    p_categoria := 'general';
  else
    p_categoria := lower(trim(p_categoria));
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select id into v_caja_id
  from public.caja
  where fecha = public.fecha_local() and estado = 'abierta' and colmado_id = v_colmado
  order by abierta_at desc
  limit 1;

  insert into public.gastos (descripcion, monto, categoria, caja_id, empleado_id, colmado_id)
  values (trim(p_descripcion), p_monto, p_categoria, v_caja_id, auth.uid(), v_colmado);
end;
$$;

create or replace function public.presupuesto_mes(p_mes date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inicio date;
  v_fin date;
  v_total_presupuesto numeric(10,2);
  v_total_gastado numeric(10,2);
  v_filas jsonb;
  v_colmado uuid;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede ver el presupuesto';
  end if;

  if p_mes is null then
    raise exception 'Indica el mes';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  v_inicio := date_trunc('month', p_mes)::date;
  v_fin := (v_inicio + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(monto), 0) into v_total_presupuesto
  from public.presupuestos
  where mes = v_inicio
    and colmado_id = v_colmado;

  select coalesce(sum(g.monto), 0) into v_total_gastado
  from public.gastos g
  where (g.fecha at time zone 'America/Santo_Domingo')::date between v_inicio and v_fin
    and g.colmado_id = v_colmado;

  select coalesce(jsonb_agg(f order by f->>'categoria'), '[]'::jsonb) into v_filas
  from (
    with cats as (
      select categoria
      from public.presupuestos
      where mes = v_inicio and colmado_id = v_colmado
      union
      select distinct lower(trim(categoria))
      from public.gastos
      where (fecha at time zone 'America/Santo_Domingo')::date between v_inicio and v_fin
        and colmado_id = v_colmado
    )
    select jsonb_build_object(
      'categoria', c.categoria,
      'presupuesto', coalesce(
        (select p2.monto from public.presupuestos p2
         where p2.mes = v_inicio and p2.categoria = c.categoria and p2.colmado_id = v_colmado), 0),
      'gastado', coalesce(
        (select sum(g2.monto) from public.gastos g2
         where lower(trim(g2.categoria)) = c.categoria
           and (g2.fecha at time zone 'America/Santo_Domingo')::date between v_inicio and v_fin
           and g2.colmado_id = v_colmado), 0)
    ) as f
    from cats c
  ) s;

  return jsonb_build_object(
    'total_presupuesto', v_total_presupuesto,
    'total_gastado', v_total_gastado,
    'filas', v_filas
  );
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
  v_por_paquete numeric(10,2);
  v_total numeric(10,2) := 0;
  v_colmado uuid;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede registrar compras';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe incluir al menos un producto';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select sum(((v_item->>'cantidad')::int) * ((v_item->>'costo_unitario')::numeric))
  into v_total
  from (
    select jsonb_array_elements(p_items) as v_item
  ) t;

  insert into public.compras (proveedor, fecha, total, created_by, colmado_id)
  values (p_proveedor, now(), v_total, auth.uid(), v_colmado)
  returning id into v_compra_id;

  for v_item in select jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_costo := (v_item->>'costo_unitario')::numeric;

    select unidades_por_paquete into v_por_paquete
    from public.productos where id = v_producto_id and colmado_id = v_colmado;
    if v_por_paquete is null then
      raise exception 'Producto no encontrado';
    end if;
    v_por_paquete := coalesce(v_por_paquete, 0);
    if v_por_paquete <= 0 then
      v_por_paquete := 1;
    end if;

    insert into public.compra_items (compra_id, producto_id, cantidad, costo_unitario, colmado_id)
    values (v_compra_id, v_producto_id, v_cantidad, v_costo, v_colmado);

    update public.productos
    set stock = stock + (v_cantidad * v_por_paquete)::int,
        precio_compra = v_costo,
        updated_at = now()
    where id = v_producto_id;

    insert into public.movimientos_stock (producto_id, concepto, cantidad, referencia, created_by, colmado_id)
    values (v_producto_id, 'compra', (v_cantidad * v_por_paquete)::int, v_compra_id, auth.uid(), v_colmado);
  end loop;

  return v_compra_id;
end;
$$;

-- ==================== MULTI-COLMADO ====================

create table if not exists public.colmados (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  codigo text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists colmado_id uuid references public.colmados on delete set null;

create or replace function public.mi_colmado() returns uuid
language sql stable set search_path = public as $$
  select colmado_id from public.profiles where id = auth.uid();
$$;

create or replace function public.pertenece(p_colmado_id uuid) returns boolean
language sql stable set search_path = public as $$
  select p_colmado_id is not null and exists (
    select 1 from public.profiles where id = auth.uid() and colmado_id = p_colmado_id
  );
$$;

alter table public.categorias add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.productos add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.movimientos_stock add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.compras add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.compra_items add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.clientes add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.ventas add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.venta_items add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.pagos_fiado add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.gastos add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.mermas add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.conteos add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.conteo_items add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.caja add column if not exists colmado_id uuid default public.mi_colmado();
alter table public.presupuestos add column if not exists colmado_id uuid default public.mi_colmado();

alter table public.caja drop constraint if exists caja_fecha_key;
alter table public.caja drop constraint if exists caja_fecha_colmado_key;
alter table public.presupuestos drop constraint if exists presupuestos_mes_categoria_key;
alter table public.presupuestos drop constraint if exists presupuestos_colmado_key;

do $$
declare
  v_dup record;
  v_mantener uuid;
begin
  for v_dup in
    select coalesce(colmado_id, '00000000-0000-0000-0000-000000000000') as cid, fecha
    from public.caja
    group by coalesce(colmado_id, '00000000-0000-0000-0000-000000000000'), fecha
    having count(*) > 1
  loop
    select id into v_mantener
    from public.caja
    where coalesce(colmado_id, '00000000-0000-0000-0000-000000000000') = v_dup.cid
      and fecha = v_dup.fecha
    order by abierta_at desc, id
    limit 1;

    update public.ventas set caja_id = v_mantener
    where caja_id in (
      select id from public.caja
      where coalesce(colmado_id, '00000000-0000-0000-0000-000000000000') = v_dup.cid
        and fecha = v_dup.fecha
        and id <> v_mantener
    );

    update public.pagos_fiado set caja_id = v_mantener
    where caja_id in (
      select id from public.caja
      where coalesce(colmado_id, '00000000-0000-0000-0000-000000000000') = v_dup.cid
        and fecha = v_dup.fecha
        and id <> v_mantener
    );

    update public.gastos set caja_id = v_mantener
    where caja_id in (
      select id from public.caja
      where coalesce(colmado_id, '00000000-0000-0000-0000-000000000000') = v_dup.cid
        and fecha = v_dup.fecha
        and id <> v_mantener
    );

    delete from public.caja
    where coalesce(colmado_id, '00000000-0000-0000-0000-000000000000') = v_dup.cid
      and fecha = v_dup.fecha
      and id <> v_mantener;
  end loop;
end $$;

do $$
declare
  v_dup record;
begin
  for v_dup in
    select coalesce(colmado_id, '00000000-0000-0000-0000-000000000000') as cid, mes, categoria
    from public.presupuestos
    group by coalesce(colmado_id, '00000000-0000-0000-0000-000000000000'), mes, categoria
    having count(*) > 1
  loop
    delete from public.presupuestos p
    where p.mes = v_dup.mes
      and p.categoria = v_dup.categoria
      and coalesce(p.colmado_id, '00000000-0000-0000-0000-000000000000') = v_dup.cid
      and p.id <> (
        select id from public.presupuestos k
        where k.mes = p.mes
          and k.categoria = p.categoria
          and coalesce(k.colmado_id, '00000000-0000-0000-0000-000000000000') = v_dup.cid
        order by k.created_at desc, k.id desc
        limit 1
      );
  end loop;
end $$;

alter table public.caja add constraint caja_fecha_colmado_key unique (colmado_id, fecha);
alter table public.presupuestos add constraint presupuestos_colmado_key unique (colmado_id, mes, categoria);

do $$
declare
  v_colmado uuid;
  v_nombre text;
  v_codigo text;
begin
  select id into v_colmado from public.colmados order by created_at, id limit 1;
  if v_colmado is null then
    select nombre into v_nombre from public.profiles order by created_at limit 1;
    if v_nombre is null then
      v_nombre := 'Mi Colmado';
    end if;
    v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    insert into public.colmados (nombre, codigo)
    values (v_nombre, v_codigo)
    returning id into v_colmado;
  end if;

  update public.profiles set colmado_id = v_colmado where colmado_id is null;
  update public.categorias set colmado_id = v_colmado where colmado_id is null;
  update public.productos set colmado_id = v_colmado where colmado_id is null;
  update public.movimientos_stock set colmado_id = v_colmado where colmado_id is null;
  update public.compras set colmado_id = v_colmado where colmado_id is null;
  update public.compra_items set colmado_id = v_colmado where colmado_id is null;
  update public.clientes set colmado_id = v_colmado where colmado_id is null;
  update public.ventas set colmado_id = v_colmado where colmado_id is null;
  update public.venta_items set colmado_id = v_colmado where colmado_id is null;
  update public.pagos_fiado set colmado_id = v_colmado where colmado_id is null;
  update public.gastos set colmado_id = v_colmado where colmado_id is null;
  update public.mermas set colmado_id = v_colmado where colmado_id is null;
  update public.conteos set colmado_id = v_colmado where colmado_id is null;
  update public.conteo_items set colmado_id = v_colmado where colmado_id is null;
  update public.caja set colmado_id = v_colmado where colmado_id is null;
  update public.presupuestos set colmado_id = v_colmado where colmado_id is null;
end $$;

create or replace function public.caja_abierta_hoy() returns uuid
language sql security definer set search_path = public as $$
  select id
  from public.caja
  where fecha = public.fecha_local()
    and estado = 'abierta'
    and colmado_id = public.mi_colmado()
  order by abierta_at desc
  limit 1;
$$;

create or replace function public.crear_colmado(p_nombre text) returns public.colmados
language plpgsql security definer set search_path = public as $$
declare
  v_colmado public.colmados;
  v_codigo text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'Escribe el nombre de tu colmado';
  end if;
  if (select public.mi_colmado()) is not null then
    raise exception 'Ya perteneces a un colmado';
  end if;

  v_codigo := '';
  while v_codigo = '' loop
    v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    if exists (select 1 from public.colmados where codigo = v_codigo) then
      v_codigo := '';
    end if;
  end loop;

  insert into public.colmados (nombre, codigo)
  values (trim(p_nombre), v_codigo)
  returning * into v_colmado;

  update public.profiles
  set colmado_id = v_colmado.id
  where id = auth.uid();

  return v_colmado;
end;
$$;

create or replace function public.unirse_colmado(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_colmado_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n';
  end if;
  if (select public.mi_colmado()) is not null then
    raise exception 'Ya perteneces a un colmado';
  end if;

  select id into v_colmado_id
  from public.colmados
  where codigo = upper(trim(p_codigo));

  if v_colmado_id is null then
    raise exception 'El cÃ³digo no es vÃ¡lido';
  end if;

  update public.profiles
  set colmado_id = v_colmado_id
  where id = auth.uid();
end;
$$;

create or replace function public.asignar_equipo(p_usuario_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_colmado uuid;
begin
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede asignar cajeros';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  update public.profiles
  set colmado_id = v_colmado
  where id = p_usuario_id
    and (colmado_id is null or colmado_id = v_colmado);

  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end;
$$;

create or replace function public.lista_equipo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_colmado uuid;
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesiÃ³n';
  end if;
  if not public.is_jefe() then
    raise exception 'Solo el jefe puede ver el equipo';
  end if;

  v_colmado := public.mi_colmado();
  if v_colmado is null then
    raise exception 'Debes pertenecer a un colmado';
  end if;

  select coalesce(jsonb_agg(f order by f->>'created_at'), '[]'::jsonb) into v_resultado
  from (
    select jsonb_build_object(
      'id', p.id,
      'nombre', p.nombre,
      'rol', p.rol,
      'colmado_id', p.colmado_id,
      'created_at', p.created_at
    ) as f
    from public.profiles p
    where p.colmado_id = v_colmado or p.colmado_id is null
  ) s;

  return v_resultado;
end;
$$;

create or replace function public.mi_colmado_info() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('nombre', c.nombre, 'codigo', c.codigo)
  from public.colmados c
  where c.id = public.mi_colmado();
$$;

create or replace function public.idx_ventas_numero() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(numero), 0) + 1 into new.numero
  from public.ventas
  where colmado_id = new.colmado_id;
  return new;
end;
$$;

alter table public.profiles enable row level security;
alter table public.colmados enable row level security;

drop policy if exists "Perfil propio" on public.profiles;
drop policy if exists "Jefe edita perfiles" on public.profiles;
drop policy if exists "Miembros del colmado" on public.profiles;
drop policy if exists "Jefe gestiona equipo" on public.profiles;
drop policy if exists "Jefe ve su colmado" on public.colmados;
create policy "Perfil propio" on public.profiles
  for select using (auth.uid() = id);
create policy "Miembros del colmado" on public.profiles
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Jefe gestiona equipo" on public.profiles
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());
create policy "Jefe ve su colmado" on public.colmados
  for select to authenticated using (public.pertenece(id));

drop policy if exists "Lectura general" on public.categorias;
drop policy if exists "Jefe gestiona categorias" on public.categorias;
drop policy if exists "Categorias del colmado" on public.categorias;
create policy "Categorias del colmado" on public.categorias
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Jefe gestiona categorias" on public.categorias
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.productos;
drop policy if exists "Jefe gestiona productos" on public.productos;
drop policy if exists "Productos del colmado" on public.productos;
create policy "Productos del colmado" on public.productos
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Jefe gestiona productos" on public.productos
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.movimientos_stock;
drop policy if exists "Registro autenticado" on public.movimientos_stock;
drop policy if exists "Movimientos del colmado" on public.movimientos_stock;
drop policy if exists "Registro movimientos del colmado" on public.movimientos_stock;
create policy "Movimientos del colmado" on public.movimientos_stock
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Registro movimientos del colmado" on public.movimientos_stock
  for insert to authenticated with check (public.pertenece(colmado_id));

drop policy if exists "Lectura general" on public.compras;
drop policy if exists "Jefe gestiona compras" on public.compras;
drop policy if exists "Jefe lee compras" on public.compras;
drop policy if exists "Compras del colmado" on public.compras;
create policy "Compras del colmado" on public.compras
  for select to authenticated using (public.pertenece(colmado_id) and public.is_jefe());
create policy "Jefe gestiona compras" on public.compras
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.compra_items;
drop policy if exists "Jefe gestiona items de compra" on public.compra_items;
drop policy if exists "Jefe lee items de compra" on public.compra_items;
drop policy if exists "Items compra del colmado" on public.compra_items;
create policy "Items compra del colmado" on public.compra_items
  for select to authenticated using (public.pertenece(colmado_id) and public.is_jefe());
create policy "Jefe gestiona items compra" on public.compra_items
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.clientes;
drop policy if exists "Registro autenticado clientes" on public.clientes;
drop policy if exists "Clientes del colmado" on public.clientes;
drop policy if exists "Registro clientes del colmado" on public.clientes;
create policy "Clientes del colmado" on public.clientes
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Registro clientes del colmado" on public.clientes
  for insert to authenticated with check (public.pertenece(colmado_id));

drop policy if exists "Lectura general" on public.ventas;
drop policy if exists "Registro autenticado ventas" on public.ventas;
drop policy if exists "Jefe anula ventas" on public.ventas;
drop policy if exists "Ventas del colmado" on public.ventas;
drop policy if exists "Registro ventas del colmado" on public.ventas;
drop policy if exists "Jefe anula ventas del colmado" on public.ventas;
create policy "Ventas del colmado" on public.ventas
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Registro ventas del colmado" on public.ventas
  for insert to authenticated with check (public.pertenece(colmado_id));
create policy "Jefe anula ventas del colmado" on public.ventas
  for update to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.venta_items;
drop policy if exists "Registro autenticado items" on public.venta_items;
drop policy if exists "Items venta del colmado" on public.venta_items;
drop policy if exists "Registro items del colmado" on public.venta_items;
create policy "Items venta del colmado" on public.venta_items
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Registro items del colmado" on public.venta_items
  for insert to authenticated with check (public.pertenece(colmado_id));

drop policy if exists "Lectura general" on public.pagos_fiado;
drop policy if exists "Registro autenticado pagos" on public.pagos_fiado;
drop policy if exists "Pagos fiado del colmado" on public.pagos_fiado;
drop policy if exists "Registro pagos del colmado" on public.pagos_fiado;
create policy "Pagos fiado del colmado" on public.pagos_fiado
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Registro pagos del colmado" on public.pagos_fiado
  for insert to authenticated with check (public.pertenece(colmado_id));

drop policy if exists "Lectura general" on public.gastos;
drop policy if exists "Registro autenticado gastos" on public.gastos;
drop policy if exists "Gastos del colmado" on public.gastos;
create policy "Gastos del colmado" on public.gastos
  for select to authenticated using (public.pertenece(colmado_id) and public.is_jefe());
create policy "Jefe gestiona gastos" on public.gastos
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.mermas;
drop policy if exists "Jefe gestiona mermas" on public.mermas;
drop policy if exists "Mermas del colmado" on public.mermas;
create policy "Mermas del colmado" on public.mermas
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Jefe gestiona mermas" on public.mermas
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.conteos;
drop policy if exists "Jefe gestiona conteos" on public.conteos;
drop policy if exists "Conteos del colmado" on public.conteos;
create policy "Conteos del colmado" on public.conteos
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Jefe gestiona conteos" on public.conteos
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.conteo_items;
drop policy if exists "Jefe gestiona items de conteo" on public.conteo_items;
drop policy if exists "Items conteo del colmado" on public.conteo_items;
create policy "Items conteo del colmado" on public.conteo_items
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Jefe gestiona items conteo" on public.conteo_items
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general" on public.caja;
drop policy if exists "Jefe gestiona caja" on public.caja;
drop policy if exists "Jefe lee caja" on public.caja;
drop policy if exists "Caja del colmado" on public.caja;
create policy "Caja del colmado" on public.caja
  for select to authenticated using (public.pertenece(colmado_id));
create policy "Jefe gestiona caja" on public.caja
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());

drop policy if exists "Lectura general presupuestos" on public.presupuestos;
drop policy if exists "Jefe gestiona presupuestos" on public.presupuestos;
drop policy if exists "Presupuestos del colmado" on public.presupuestos;
create policy "Presupuestos del colmado" on public.presupuestos
  for select to authenticated using (public.pertenece(colmado_id) and public.is_jefe());
create policy "Jefe gestiona presupuestos" on public.presupuestos
  for all to authenticated using (public.pertenece(colmado_id) and public.is_jefe()) with check (public.pertenece(colmado_id) and public.is_jefe());
