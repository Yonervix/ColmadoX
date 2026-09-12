import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ColmadoService } from '../../core/services/colmado.service';

@Component({
  selector: 'app-onboarding',
  imports: [FormsModule],
  templateUrl: './onboarding.component.html',
})
export class OnboardingComponent {
  private auth = inject(AuthService);
  private colmados = inject(ColmadoService);
  private router = inject(Router);

  protected readonly esJefe = this.auth.isJefe;
  protected readonly modo = signal<'crear' | 'unirse'>(
    this.auth.isJefe() ? 'crear' : 'unirse'
  );
  protected nombre = '';
  protected codigo = '';
  protected error = signal('');
  protected cargando = signal(false);

  protected cambiarModo(modo: 'crear' | 'unirse') {
    this.modo.set(modo);
    this.error.set('');
  }

  protected async crear() {
    if (!this.nombre.trim()) return;
    this.cargando.set(true);
    this.error.set('');
    const err = await this.colmados.crear(this.nombre.trim());
    this.cargando.set(false);
    if (err) {
      this.error.set(err);
    } else {
      this.router.navigate(['/inicio']);
    }
  }

  protected async unirse() {
    if (!this.codigo.trim()) return;
    this.cargando.set(true);
    this.error.set('');
    const err = await this.colmados.unirse(this.codigo.trim());
    this.cargando.set(false);
    if (err) {
      this.error.set(err);
    } else {
      this.router.navigate(['/inicio']);
    }
  }
}