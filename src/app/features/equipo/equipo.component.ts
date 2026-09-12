import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EquipoService, type Miembro } from './equipo.service';
import { ColmadoService } from '../../core/services/colmado.service';
import { AuthService } from '../../core/services/auth.service';
import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina/encabezado-pagina.component';

@Component({
  selector: 'app-equipo',
  imports: [FormsModule, EncabezadoPaginaComponent],
  templateUrl: './equipo.component.html',
})
export class EquipoComponent implements OnInit {
  private servicio = inject(EquipoService);
  private colmados = inject(ColmadoService);
  private auth = inject(AuthService);

  protected readonly miembros = this.servicio.miembros;
  protected readonly colmado = this.colmados.info;
  protected readonly perfilId = computed(() => this.auth.perfil()?.id);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly codigoCopiado = signal(false);

  protected nombre = '';
  protected email = '';
  protected password = '';
  protected creando = signal(false);
  protected asignando = signal('');

  protected readonly team = computed(() =>
    this.miembros().filter((m: Miembro) => !!m.colmado_id),
  );
  protected readonly pendientes = computed(() =>
    this.miembros().filter((m: Miembro) => !m.colmado_id),
  );

  ngOnInit() {
    void this.cargar();
  }

  protected async cargar() {
    this.cargando.set(true);
    this.error.set('');
    try {
      await Promise.all([this.servicio.listar(), this.colmados.cargar()]);
    } catch (e) {
      this.error.set((e as Error).message);
    }
    this.cargando.set(false);
  }

  protected copiarCodigo() {
    const codigo = this.colmados.info()?.codigo;
    if (!codigo) return;
    void navigator.clipboard.writeText(codigo).then(() => {
      this.codigoCopiado.set(true);
      setTimeout(() => this.codigoCopiado.set(false), 1500);
    });
  }

  protected async crearCajero() {
    if (!this.nombre.trim() || !this.email.trim() || !this.password) {
      this.error.set('Completa nombre, correo y contraseña del cajero.');
      return;
    }
    this.creando.set(true);
    this.error.set('');
    const err = await this.servicio.crearCajero(this.nombre.trim(), this.email.trim(), this.password);
    this.creando.set(false);
    if (err) {
      this.error.set(err);
    } else {
      this.nombre = '';
      this.email = '';
      this.password = '';
    }
  }

  protected async asignar(id: string) {
    this.asignando.set(id);
    this.error.set('');
    const err = await this.servicio.asignar(id);
    this.asignando.set('');
    if (err) this.error.set(err);
  }
}