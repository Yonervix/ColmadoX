import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ComprasService, type ItemCompra, type Compra } from './compras.service';
import type { Producto, TipoProducto } from '../inventario/inventario.types';

@Component({
  selector: 'app-compras',
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './compras.component.html',
})
export class ComprasComponent implements OnInit {
  private servicio = inject(ComprasService);

  protected readonly productos = signal<Producto[]>([]);
  protected readonly compras = signal<Compra[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  protected readonly historialAbierto = signal(false);

  protected proveedor = '';
  protected items = signal<ItemCompra[]>([this.itemVacio()]);

  async ngOnInit() {
    await this.cargarTodo();
  }

  private async cargarTodo() {
    try {
      const [prods, compras] = await Promise.all([
        this.servicio.listarProductos(),
        this.servicio.listarCompras(),
      ]);
      this.productos.set(prods);
      this.compras.set(compras);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected totalActual(): number {
    return this.items().reduce((acc, i) => acc + (i.cantidad || 0) * (i.costo_unitario || 0), 0);
  }

  protected onCambiarProducto(item: ItemCompra, productoId: string) {
    item.producto_id = productoId;
    const producto = this.productos().find((p) => p.id === productoId);
    if (producto) {
      item.nombre = producto.nombre;
      item.costo_unitario = Number(producto.precio_compra) || 0;
    }
  }

  protected agregarItem() {
    this.items.set([...this.items(), this.itemVacio()]);
  }

  protected quitarItem(index: number) {
    if (this.items().length === 1) return;
    const copia = [...this.items()];
    copia.splice(index, 1);
    this.items.set(copia);
  }

  protected async guardar() {
    const proveedor = this.proveedor.trim();
    const items = this.items().filter((i) => i.producto_id && i.cantidad > 0 && i.costo_unitario >= 0);
    if (!proveedor) {
      this.error.set('Escribe el nombre del proveedor.');
      return;
    }
    if (items.length === 0) {
      this.error.set('Agrega al menos un producto con cantidad.');
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    try {
      await this.servicio.registrarCompra(proveedor, items);
      this.proveedor = '';
      this.items.set([this.itemVacio()]);
      this.historialAbierto.set(false);
      await this.cargarTodo();
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.guardando.set(false);
  }

  protected etiquetaTipo(t: TipoProducto): string {
    return { unidad: 'Suelto', paquete: 'Paquete', caja: 'Caja' }[t] ?? '—';
  }

  protected infoProducto(p: Producto): string {
    const base = this.etiquetaTipo(p.tipo);
    if (p.tipo !== 'unidad' && p.unidades_por_paquete && p.unidades_por_paquete > 0) {
      return `${base}, ${p.unidades_por_paquete} c/u`;
    }
    if (p.tipo !== 'unidad') return `${base} sin conteo`;
    return base;
  }

  private itemVacio(): ItemCompra {
    return { producto_id: '', nombre: '', cantidad: 1, costo_unitario: 0 };
  }
}