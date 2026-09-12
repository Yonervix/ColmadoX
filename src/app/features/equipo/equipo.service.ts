import { inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import type { Perfil } from '../../core/services/auth.service';

export interface Miembro {
  id: string;
  nombre: string;
  rol: Perfil['rol'];
  colmado_id: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class EquipoService {
  private supabase = inject(SupabaseService);

  readonly miembros = signal<Miembro[]>([]);

  async listar() {
    const { data, error } = await this.supabase.client.rpc('lista_equipo');
    if (error) throw new Error(error.message);
    this.miembros.set((data ?? []) as Miembro[]);
  }

  async crearCajero(nombre: string, email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: { data: { nombre, rol: 'empleado' } },
    });
    if (error) return error.message;
    await this.listar();
    return null;
  }

  async asignar(usuarioId: string): Promise<string | null> {
    const { error } = await this.supabase.client.rpc('asignar_equipo', {
      p_usuario_id: usuarioId,
    });
    if (error) return error.message;
    await this.listar();
    return null;
  }
}