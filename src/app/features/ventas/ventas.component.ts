import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
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
  imports: [FormsModule, DecimalPipe],
  templateUrl: './ventas.component.html',
})
export class VentasComponent implements OnInit {
  private servicio = inject(VentaService);

  protected readonly productos = signal<ProductoVenta[]>([]);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly carrito = signal<Linea[]>([]);
  protected readonly cargando = signal(true);
  protected readonly cobrando = signal(false);
  protected readonly buscando = signal('');
  protected readonly tipo = signal<'contado' | 'fiado'>('contado');
  protected readonly clienteId = signal<string | null>(null);
  protected readonly pagoCon = signal<number | null>(null);
  protected readonly descuento = signal(0);
  protected readonly nuevoCliente = signal('');
  protected readonly error = signal('');
  protected readonly recibo = signal<{ venta: VentaRegistrada; lineas: Linea[] } | null>(null);

  protected readonly productosFiltrados = computed(() => {
    const q = this.buscando().toLowerCase().trim();
    const lista = this.productos();
    if (!q) return lista;
    return lista.filter((p) => p.nombre.toLowerCase().includes(q));
  });

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

  async ngOnInit() {
    await this.cargarTodo();
  }

  private async cargarTodo() {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [productos, clientes] = await Promise.all([
        this.servicio.listarProductos(),
        this.servicio.listarClientes(),
      ]);
      this.productos.set(productos);
      this.clientes.set(clientes);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected agregar(p: ProductoVenta) {
    const actual = this.carrito();
    const linea = actual.find((l) => l.producto.id === p.id);
    if (linea) {
      if (linea.cantidad >= p.stock) {
        this.error.set(`No hay más stock de "${p.nombre}".`);
        return;
      }
      linea.cantidad++;
      this.carrito.set([...actual]);
    } else {
      this.carrito.set([...actual, { producto: p, cantidad: 1 }]);
    }
    this.error.set('');
  }

  protected subir(linea: Linea) {
    const actual = this.carrito();
    if (linea.cantidad >= linea.producto.stock) {
      this.error.set(`No hay más stock de "${linea.producto.nombre}".`);
      return;
    }
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

  protected etiquetaTipo(t: TipoProducto): string {
    return { unidad: 'Suelto', paquete: 'Paquete', caja: 'Caja' }[t] ?? '';
  }
}