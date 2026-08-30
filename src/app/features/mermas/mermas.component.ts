import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MermasService, type ItemConteo, type Merma } from './mermas.service';
import type { Producto } from '../inventario/inventario.types';

type Pestana = 'mermas' | 'conteo';

@Component({
  selector: 'app-mermas',
  imports: [FormsModule, DatePipe],
  templateUrl: './mermas.component.html',
})
export class MermasComponent implements OnInit {
  private servicio = inject(MermasService);

  protected readonly pestana = signal<Pestana>('mermas');
  protected readonly productos = signal<Producto[]>([]);
  protected readonly historial = signal<Merma[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly registrando = signal(false);
  protected readonly creadoConteo = signal(false);

  protected productoId = '';
  protected cantidad = 1;
  protected motivo = 'Vencido';
  protected readonly motivos = ['Vencido', 'Roto', 'Perdido', 'Robo', 'Otro'];

  protected conteoId = '';
  protected conteoItems = signal<ItemConteo[]>([]);

  async ngOnInit() {
    this.cargando.set(true);
    try {
      const [productos, historial] = await Promise.all([
        this.servicio.listarProductos(),
        this.servicio.listarMermas(),
      ]);
      this.productos.set(productos);
      this.historial.set(historial);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected cambiarPestana(t: Pestana) {
    this.pestana.set(t);
    this.error.set('');
  }

  protected async registrar() {
    if (!this.productoId || this.cantidad <= 0) {
      this.error.set('Elige un producto y una cantidad válida.');
      return;
    }
    this.registrando.set(true);
    this.error.set('');
    try {
      await this.servicio.registrarMerma(this.productoId, this.cantidad, this.motivo);
      this.productoId = '';
      this.cantidad = 1;
      this.historial.set(await this.servicio.listarMermas());
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.registrando.set(false);
  }

  protected async iniciarConteo() {
    this.error.set('');
    try {
      const productos = await this.servicio.listarProductos();
      this.conteoId = await this.servicio.iniciarConteo();
      this.conteoItems.set(
        productos.map((p) => ({
          producto_id: p.id,
          nombre: p.nombre,
          stock_sistema: p.stock,
          stock_fisico: p.stock,
        })),
      );
      this.creadoConteo.set(true);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected setFisico(item: ItemConteo, valor: number) {
    item.stock_fisico = valor >= 0 ? valor : 0;
  }

  protected diferencia(item: ItemConteo): number {
    return (item.stock_fisico ?? 0) - item.stock_sistema;
  }

  protected async cerrarConteo() {
    this.registrando.set(true);
    this.error.set('');
    try {
      await this.servicio.cerrarConteo(this.conteoId, this.conteoItems());
      this.creadoConteo.set(false);
      this.conteoId = '';
      this.conteoItems.set([]);
      this.historial.set(await this.servicio.listarMermas());
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.registrando.set(false);
  }
}