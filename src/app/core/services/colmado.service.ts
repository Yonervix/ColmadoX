import { inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface InfoColmado {
  nombre: string;
  codigo: string;
}

@Injectable({ providedIn: 'root' })
export class ColmadoService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);

  readonly info = signal<InfoColmado | null>(null);

  async cargar() {
    if (!this.auth.tieneColmado()) {
      this.info.set(null);
      return;
    }
    const { data } = await this.supabase.client.rpc('mi_colmado_info');
    this.info.set((data as InfoColmado | null) ?? null);
  }

  async crear(nombre: string): Promise<string | null> {
    const { error } = await this.supabase.client.rpc('crear_colmado', { p_nombre: nombre });
    if (error) return error.message;
    await this.auth.recargarPerfil();
    await this.cargar();
    return null;
  }

  async unirse(codigo: string): Promise<string | null> {
    const { error } = await this.supabase.client.rpc('unirse_colmado', { p_codigo: codigo });
    if (error) return error.message;
    await this.auth.recargarPerfil();
    await this.cargar();
    return null;
  }
}