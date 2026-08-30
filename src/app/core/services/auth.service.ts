import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type Rol = 'jefe' | 'empleado';

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService);

  readonly session = signal<Session | null>(null);
  readonly perfil = signal<Perfil | null>(null);
  readonly listo: Promise<void>;

  readonly isJefe = computed(() => this.perfil()?.rol === 'jefe');

  constructor() {
    this.listo = this.cargarSesion();
  }

  private async cargarSesion() {
    const { data } = await this.supabase.client.auth.getSession();
    this.session.set(data.session);
    if (data.session) {
      await this.cargarPerfil(data.session.user.id);
    }
    this.supabase.client.auth.onAuthStateChange((_evento, session) => {
      this.session.set(session);
      if (session) {
        this.cargarPerfil(session.user.id);
      } else {
        this.perfil.set(null);
      }
    });
  }

  private async cargarPerfil(uid: string) {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();
    if (!error && data) {
      this.perfil.set(data as Perfil);
    }
  }

  async iniciarSesion(email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password,
    });
    return error?.message ?? null;
  }

  async cerrarSesion() {
    await this.supabase.client.auth.signOut();
  }
}