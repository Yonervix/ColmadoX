import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

export interface Deudor {
  id: string;
  nombre: string;
  telefono: string | null;
  saldo: number;
  ultima_venta: string | null;
}

export interface VentaFiado {
  id: string;
  numero: number;
  total: number;
  anulada: boolean;
  created_at: string;
}

export interface PagoFiado {
  id: string;
  monto: number;
  fecha: string;
}

export interface HistorialCli {
  ventas: VentaFiado[];
  pagos: PagoFiado[];
}

@Injectable({ providedIn: 'root' })
export class FiadoService {
  private supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async deudores(): Promise<Deudor[]> {
    const { data, error } = await this.db
      .from('deudores')
      .select('id, nombre, telefono, saldo, ultima_venta')
      .gt('saldo', 0)
      .order('saldo', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Deudor[];
  }

  async cajaAbierta(): Promise<boolean> {
    const { data, error } = await this.db.rpc('caja_abierta_hoy');
    if (error) throw new Error(error.message);
    return !!data;
  }

  async pagar(clienteId: string, monto: number): Promise<void> {
    const { error } = await this.db.rpc('registrar_pago', {
      p_cliente_id: clienteId,
      p_monto: monto,
    });
    if (error) throw new Error(error.message);
  }

  async historial(clienteId: string): Promise<HistorialCli> {
    const [ventas, pagos] = await Promise.all([
      this.db
        .from('ventas')
        .select('id, numero, total, anulada, created_at')
        .eq('cliente_id', clienteId)
        .eq('tipo', 'fiado')
        .order('created_at', { ascending: false }),
      this.db
        .from('pagos_fiado')
        .select('id, monto, fecha')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false }),
    ]);
    if (ventas.error) throw new Error(ventas.error.message);
    if (pagos.error) throw new Error(pagos.error.message);
    return {
      ventas: (ventas.data ?? []) as VentaFiado[],
      pagos: (pagos.data ?? []) as PagoFiado[],
    };
  }
}