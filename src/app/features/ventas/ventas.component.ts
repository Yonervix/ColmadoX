import { Component, computed, ElementRef, HostListener, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina/encabezado-pagina.component';
import {
  VentaService,
  type Cliente,
  type ProductoVenta,
  type VentaRegistrada,
} from './venta.service';
import type { TipoProducto } from '../inventario/inventario.types';

interface Linea {
  producto: ProductoVenta;
  cantidad: number;
}

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, DecimalPipe, EncabezadoPaginaComponent],
  templateUrl: './ventas.component.html',
})
export class VentasComponent implements OnInit {
  private servicio = inject(VentaService);
  private router = inject(Router);

  protected readonly productos = signal<ProductoVenta[]>([]);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly carrito = signal<Linea[]>([]);
  protected readonly cargando = signal(true);
  protected readonly cobrando = signal(false);
  protected readonly buscando = signal('');
  protected readonly filtroTipo = signal<'todos' | TipoProducto>('todos');
  protected readonly tipo = signal<'contado' | 'fiado'>('contado');
  protected readonly clienteId = signal<string | null>(null);
  protected readonly pagoCon = signal<number | null>(null);
  protected readonly descuento = signal(0);
  protected readonly nuevoCliente = signal('');
  protected readonly error = signal('');
  protected readonly sinCaja = signal(false);
  protected readonly recibo = signal<{ venta: VentaRegistrada; lineas: Linea[] } | null>(null);
  protected readonly ticketAbierto = signal(true);
  private readonly buscador = viewChild<ElementRef<HTMLInputElement>>('buscador');
  protected readonly billetes = [100, 200, 500, 1000];

  protected readonly productosFiltrados = computed(() => {
    const q = this.buscando().toLowerCase().trim();
    const tipo = this.filtroTipo();
    const lista = this.productos();
    return lista.filter((p) => {
      const coincideQ = !q || p.nombre.toLowerCase().includes(q);
      const coincideTipo = tipo === 'todos' || p.tipo === tipo;
      return coincideQ && coincideTipo;
    });
  });

  protected readonly tiposFiltro: { valor: 'todos' | TipoProducto; etiqueta: string }[] = [
    { valor: 'todos', etiqueta: 'Todos' },
    { valor: 'unidad', etiqueta: 'Suelto' },
    { valor: 'paquete', etiqueta: 'Paquete' },
    { valor: 'caja', etiqueta: 'Caja' },
  ];

  protected readonly subtotal = computed(() =>
    this.carrito().reduce((acc, l) => acc + l.cantidad * l.producto.precio_venta, 0),
  );

  protected readonly total = computed(() =>
    Math.max(this.subtotal() - (this.descuento() || 0), 0),
  );

  protected readonly cambio = computed(() => {
    const pagado = this.pagoCon();
    if (this.tipo() !== 'contado' || pagado == null) return 0;
    return Math.max(pagado - this.total(), 0);
  });

  protected readonly faltante = computed(() => {
    const pagado = this.pagoCon();
    if (this.tipo() !== 'contado' || pagado == null) return 0;
    return Math.max(this.total() - pagado, 0);
  });

  protected readonly cobrable = computed(
    () =>
      this.carrito().length > 0 &&
      !this.sinCaja() &&
      !this.cobrando() &&
      (this.tipo() === 'fiado'
        ? !!this.clienteId()
        : this.pagoCon() != null && this.faltante() === 0),
  );

  async ngOnInit() {
    await this.cargarTodo();
  }

  @HostListener('document:keydown', ['$event'])
  protected atajoTeclado(event: KeyboardEvent) {
    if (this.recibo()) {
      if (event.key === 'Escape') this.cerrarRecibo();
      return;
    }
    const objetivo = event.target as HTMLElement | null;
    const tecleando =
      objetivo &&
      (objetivo.tagName === 'INPUT' || objetivo.tagName === 'SELECT' || objetivo.tagName === 'TEXTAREA');
    if (event.key === '/' && !tecleando) {
      event.preventDefault();
      this.buscador()?.nativeElement.focus();
    }
  }

  protected onBuscarKeydown(event: Event) {
    const teclado = event as KeyboardEvent;
    if (teclado.key !== 'Enter') return;
    const primero = this.productosFiltrados()[0];
    if (primero) this.agregar(primero);
  }

  protected exacto() {
    this.pagoCon.set(this.total());
    this.error.set('');
  }

  protected ponerBillete(monto: number) {
    this.pagoCon.set(monto);
    this.error.set('');
  }

  private async cargarTodo() {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [productos, clientes, cajaOk] = await Promise.all([
        this.servicio.listarProductos(),
        this.servicio.listarClientes(),
        this.servicio.cajaAbierta(),
      ]);
      this.productos.set(productos);
      this.clientes.set(clientes);
      this.sinCaja.set(!cajaOk);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected agregar(p: ProductoVenta) {
    const actual = this.carrito();
    const linea = actual.find((l) => l.producto.id === p.id);
    if (linea) {
      if (!this.esSinConteo(p) && linea.cantidad >= p.stock) {
        this.error.set(`No hay más stock de "${p.nombre}".`);
        return;
      }
      if (!this.esSinConteo(p) || linea.cantidad < 999) linea.cantidad++;
      this.carrito.set([...actual]);
    } else {
      this.carrito.set([...actual, { producto: p, cantidad: 1 }]);
    }
    this.error.set('');
  }

  protected subir(linea: Linea) {
    const actual = this.carrito();
    const p = linea.producto;
    if (!this.esSinConteo(p) && linea.cantidad >= p.stock) {
      this.error.set(`No hay más stock de "${p.nombre}".`);
      return;
    }
    if (this.esSinConteo(p) && linea.cantidad >= 999) return;
    linea.cantidad++;
    this.carrito.set([...actual]);
  }

  protected bajar(linea: Linea) {
    const actual = this.carrito();
    if (linea.cantidad <= 1) {
      this.quitar(linea);
      return;
    }
    linea.cantidad--;
    this.carrito.set([...actual]);
  }

  protected quitar(linea: Linea) {
    this.carrito.set(this.carrito().filter((l) => l.producto.id !== linea.producto.id));
  }

  protected seleccionarTipo(t: 'contado' | 'fiado') {
    this.tipo.set(t);
    if (t === 'contado') this.clienteId.set(null);
    this.error.set('');
  }

  protected async crearClienteRapido() {
    const nombre = this.nuevoCliente().trim();
    if (!nombre) return;
    try {
      const creado = await this.servicio.crearCliente(nombre);
      this.clientes.set([...this.clientes(), creado]);
      this.clienteId.set(creado.id);
      this.nuevoCliente.set('');
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected async cobrar() {
    const lineas = this.carrito();
    if (lineas.length === 0) {
      this.error.set('Agrega productos al carrito.');
      return;
    }
    if (this.sinCaja() || !(await this.servicio.cajaAbierta())) {
      this.sinCaja.set(true);
      this.error.set('Debes abrir la caja de hoy antes de vender.');
      return;
    }
    if (this.tipo() === 'contado') {
      const pagado = this.pagoCon();
      if (pagado == null || pagado < this.total()) {
        this.error.set('El dinero recibido es menor al total.');
        return;
      }
    } else if (this.tipo() === 'fiado' && !this.clienteId()) {
      this.error.set('Elige el cliente que se lleva al fiado.');
      return;
    }

    this.cobrando.set(true);
    this.error.set('');
    try {
      const venta = await this.servicio.registrarVenta({
        tipo: this.tipo(),
        cliente_id: this.clienteId(),
        pago_con: this.pagoCon(),
        descuento: this.descuento(),
        items: lineas.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          precio_venta: l.producto.precio_venta,
        })),
      });
      this.recibo.set({ venta, lineas: [...lineas] });
      this.carrito.set([]);
      this.tipo.set('contado');
      this.clienteId.set(null);
      this.pagoCon.set(null);
      this.descuento.set(0);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cobrando.set(false);
  }

  protected cerrarRecibo() {
    this.recibo.set(null);
    this.cargarTodo();
  }

  protected irACaja() {
    this.router.navigate(['/caja']);
  }

  protected etiquetaTipo(t: TipoProducto): string {
    return { unidad: 'Suelto', paquete: 'Paquete', caja: 'Caja' }[t] ?? '';
  }

  protected pillTipo(t: TipoProducto): string {
    return {
      unidad: 'rounded-full bg-timon-50 px-2 py-0.5 text-[10px] font-bold text-timon-700 ring-1 ring-timon-100',
      paquete: 'rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100',
      caja: 'rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600 ring-1 ring-stone-200',
    }[t];
  }

  protected esSinConteo(p: ProductoVenta): boolean {
    return p.tipo !== 'unidad' && !(p.unidades_por_paquete && p.unidades_por_paquete > 0);
  }

  protected stockLegible(p: ProductoVenta): string {
    if (this.esSinConteo(p)) return `${p.stock} ${p.tipo === 'caja' ? 'cajas' : 'paq'}`;
    return `${p.stock} uds`;
  }
}