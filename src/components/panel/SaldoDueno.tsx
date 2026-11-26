"use client";

import { Aviso, Esqueleto } from "@/components/ui";
import { useConsulta } from "@/hooks/useConsulta";
import { PromoActiva, ResumenSaldo } from "./saldo/ResumenSaldo";
import { FormularioRecarga } from "./saldo/FormularioRecarga";
import { ListaMovimientos, ListaRecargas } from "./saldo/Historial";
import type { Movimiento, Recarga, Saldo } from "./saldo/tipos";

type DatosSaldo = { saldo: Saldo | null; recargas: Recarga[]; movimientos: Movimiento[] };

/** Saldo del dueño, cómo recargar por Yape o BCP y su historial. */
export default function SaldoDueno() {
  const { datos, error, cargando, recargar } = useConsulta<DatosSaldo>(async (sb) => {
    const [s, r, m] = await Promise.all([
      sb.rpc("mi_saldo"),
      sb
        .from("recargas_saldo")
        .select("id, monto, medio, operacion, estado, nota, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("movimientos_saldo")
        .select("id, tipo, monto, detalle, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (s.error) return { data: null, error: s.error };
    return {
      data: {
        saldo: ((s.data ?? []) as Saldo[])[0] ?? null,
        recargas: (r.data ?? []) as Recarga[],
        movimientos: (m.data ?? []) as Movimiento[],
      },
      error: null,
    };
  }, []);

  if (cargando)
    return (
      <div className="flex flex-col gap-5">
        <Esqueleto alto="h-48" />
        <Esqueleto alto="h-96" />
      </div>
    );
  if (error || !datos?.saldo) return <Aviso tono="error">No pudimos cargar tu saldo. Recarga la página.</Aviso>;

  return (
    <div className="flex animate-aparecer flex-col gap-5">
      <ResumenSaldo saldo={datos.saldo} />
      <PromoActiva saldo={datos.saldo} />
      <FormularioRecarga saldo={datos.saldo} alAvisar={recargar} />
      <ListaRecargas recargas={datos.recargas} />
      <ListaMovimientos movimientos={datos.movimientos} />
    </div>
  );
}
