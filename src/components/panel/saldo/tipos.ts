export type Saldo = {
  saldo: number;
  precio_reserva: number;
  reservas_disponibles: number;
  yape_numero: string | null;
  yape_titular: string | null;
  bcp_cuenta: string | null;
  bcp_cci: string | null;
  bcp_titular: string | null;
  bono_porcentaje: number;
  bono_desde: number;
  bono_hasta: string | null;
  reservas_mes: number;
  gastado_mes: number;
  /** Recargas de hasta este monto se suman al instante (022) */
  auto_hasta: number;
  recarga_auto_bloqueada: boolean;
  /** El pago debe venir de este nombre y número (022) */
  mi_nombre: string | null;
  mi_celular: string | null;
};

export type Recarga = {
  id: string;
  monto: number;
  medio: string;
  operacion: string;
  estado: string;
  /** no_aplica, por_verificar (sumada al instante), verificada o fallida (022) */
  verificacion: string;
  nota: string | null;
  created_at: string;
};

export type Movimiento = { id: string; tipo: string; monto: number; detalle: string | null; created_at: string };

export type Medio = "yape" | "bcp";

/** Saldo extra de la promoción y cuántas reservas da un monto. */
export function calculadora(saldo: Saldo) {
  const precio = Number(saldo.precio_reserva);
  const bonoPct = Number(saldo.bono_porcentaje);
  const bonoDesde = Number(saldo.bono_desde);
  const bonoDe = (m: number) => (bonoPct > 0 && m >= bonoDesde ? Math.round(m * bonoPct) / 100 : 0);
  return { precio, bonoPct, bonoDesde, bonoDe, reservasDe: (m: number) => Math.floor((m + bonoDe(m)) / precio) };
}

/** Cuenta BCP con guiones (191-12345678-0-12) y CCI por bloques. */
export function formatoCuenta(n: string) {
  if (n.length === 14) return n.replace(/(\d{3})(\d{8})(\d)(\d{2})/, "$1-$2-$3-$4");
  if (n.length === 13) return n.replace(/(\d{3})(\d{7})(\d)(\d{2})/, "$1-$2-$3-$4");
  if (n.length === 20) return n.replace(/(\d{3})(\d{3})(\d{12})(\d{2})/, "$1-$2-$3-$4");
  return n;
}
