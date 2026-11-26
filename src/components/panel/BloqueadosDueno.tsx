"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";

type Bloqueo = { id: string; celular: string; motivo: string | null; created_at: string };

/** Números que el dueño bloqueó en sus canchas. */
export default function BloqueadosDueno({ duenoId }: { duenoId: string }) {
  const [lista, setLista] = useState<Bloqueo[] | null>(null);

  const cargar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const { data } = await supabase
      .from("clientes_bloqueados")
      .select("id, celular, motivo, created_at")
      .eq("dueno_id", duenoId)
      .order("created_at", { ascending: false });
    setLista((data ?? []) as Bloqueo[]);
  }, [duenoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function desbloquear(b: Bloqueo) {
    if (!confirm(`¿Desbloquear +51 ${b.celular}? Podrá volver a reservar en tus canchas.`)) return;
    await supabaseNavegador()?.from("clientes_bloqueados").delete().eq("id", b.id);
    cargar();
  }

  if (!lista || lista.length === 0) return null;

  return (
    <details className="rounded-2xl bg-white p-4 text-sm shadow-sm">
      <summary className="cursor-pointer font-bold">Clientes bloqueados ({lista.length})</summary>
      <ul className="mt-2 divide-y divide-[#EFEFEF]">
        {lista.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="font-bold">+51 {b.celular}</span>
              <span className="block truncate text-xs text-[#5A5A5A]">
                {b.motivo ?? "Sin motivo"} · {fmtFecha(b.created_at, { day: "numeric", month: "short" })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => desbloquear(b)}
              className="shrink-0 rounded-lg border border-[#E3E3E3] px-3 py-1.5 text-xs font-bold"
            >
              Desbloquear
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
