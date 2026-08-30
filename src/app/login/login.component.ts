import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected email = '';
  protected password = '';
  protected error = signal('');
  protected cargando = signal(false);

  async entrar() {
    if (!this.email || !this.password) return;
    this.cargando.set(true);
    this.error.set('');
    const err = await this.auth.iniciarSesion(this.email, this.password);
    this.cargando.set(false);
    if (err) {
      this.error.set(err);
    } else {
      this.router.navigate(['/inicio']);
    }
  }
}