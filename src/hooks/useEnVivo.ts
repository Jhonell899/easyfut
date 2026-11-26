"use client";

import { useEffect, useRef } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

type Evento = "INSERT" | "UPDATE" | "DELETE" | "*";

/**
 * Avisa cuando cambia una tabla de Supabase (Realtime). Respeta las reglas RLS:
 * solo llegan los cambios que el usuario puede ver.
 *
 *   useEnVivo("reservas", recargar);
 *   useEnVivo("mensajes_reserva", agregar, { evento: "INSERT", filtro: `reserva_id=eq.${id}` });
 */
export function useEnVivo(
  tabla: string,
  alCambiar: (fila: Record<string, unknown>) => void,
  opciones: { evento?: Evento; filtro?: string; activo?: boolean } = {}
) {
  const { evento = "*", filtro, activo = true } = opciones;
  const callback = useRef(alCambiar);
  callback.current = alCambiar;

  useEffect(() => {
    const supabase = supabaseNavegador();
    if (!supabase || !activo) return;
    const canal = supabase
      .channel(`envivo-${tabla}-${filtro ?? "todo"}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: evento, schema: "public", table: tabla, ...(filtro ? { filter: filtro } : {}) },
        (cambio) => callback.current((cambio.new ?? {}) as Record<string, unknown>)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [tabla, evento, filtro, activo]);
}
