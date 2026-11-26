"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseNavegador } from "@/lib/sesionNavegador";

type Resultado<T> = { data: T | null; error: { message: string } | null };

export type EstadoConsulta<T> = {
  datos: T | null;
  error: string | null;
  /** true solo en la primera carga (al recargar se conservan los datos anteriores) */
  cargando: boolean;
  recargar: () => void;
};

/**
 * Lee datos de Supabase con estados de carga y error, y una función para recargar.
 *
 *   const { datos, error, cargando, recargar } = useConsulta(
 *     (sb) => sb.rpc("mi_saldo"),
 *     []            // vuelve a consultar cuando cambia algo de esta lista
 *   );
 *
 * Si la consulta devuelve null en vez de una promesa, no se ejecuta (útil para esperar un id).
 */
export function useConsulta<T>(
  consulta: (supabase: SupabaseClient) => PromiseLike<Resultado<T>> | null,
  dependencias: unknown[]
): EstadoConsulta<T> {
  const funcion = useRef(consulta);
  funcion.current = consulta;
  const [version, setVersion] = useState(0);
  const [estado, setEstado] = useState<{ datos: T | null; error: string | null; cargando: boolean }>({
    datos: null,
    error: null,
    cargando: true,
  });

  useEffect(() => {
    const supabase = supabaseNavegador();
    if (!supabase) {
      setEstado({ datos: null, error: "sin_configurar", cargando: false });
      return;
    }
    const promesa = funcion.current(supabase);
    if (!promesa) return;
    let vigente = true;
    Promise.resolve(promesa).then(
      ({ data, error }) => {
        if (!vigente) return;
        setEstado((antes) => ({
          datos: error ? antes.datos : data,
          error: error?.message ?? null,
          cargando: false,
        }));
      },
      (e: unknown) => {
        if (vigente) setEstado((antes) => ({ ...antes, error: e instanceof Error ? e.message : "error", cargando: false }));
      }
    );
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...dependencias]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, recargar };
}
