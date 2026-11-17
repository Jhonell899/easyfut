"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";
import Estrellas from "@/components/Estrellas";

type Resena = {
  id: string;
  cancha_id: string;
  cancha_nombre: string;
  estrellas: number;
  comentario: string | null;
  nombre: string | null;
  respuesta: string | null;
  oculta: boolean;
  reportes: number;
  motivos: string[] | null;
  created_at: string;
};

/** Moderación de reseñas: primero las más reportadas. */
export default function AdminResenas() {
  const [lista, setLista] = useState<Resena[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soloReportadas, setSoloReportadas] = useState(true);

  const cargar = useCallback(async () => {
    const { data, error } = await supabaseNavegador()!.rpc("admin_resenas");
    if (error) setError(/sin_permiso/.test(error.message) ? "Tu cuenta no es administradora." : "Falta ejecutar la migración 017 en Supabase.");
    setLista((data ?? []) as Resena[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function alternar(r: Resena) {
    await supabaseNavegador()!.rpc("admin_ocultar_resena", { p_id: r.id, p_oculta: !r.oculta });
    cargar();
  }

  if (lista === null) return <div className="h-32 animate-pulse rounded-2xl bg-white" />;
  const visibles = soloReportadas ? lista.filter((r) => r.reportes > 0 || r.oculta) : lista;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {[
          { v: true, t: `Reportadas (${lista.filter((r) => r.reportes > 0 || r.oculta).length})` },
          { v: false, t: `Todas (${lista.length})` },
        ].map((f) => (
          <button
            key={f.t}
            type="button"
            onClick={() => setSoloReportadas(f.v)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${soloReportadas === f.v ? "bg-[#0A3D2E] text-white" : "bg-white shadow-sm"}`}
          >
            {f.t}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!error && visibles.length === 0 && (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">
          {soloReportadas ? "No hay reseñas reportadas." : "Todavía no hay reseñas."}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {visibles.map((r) => (
          <li
            key={r.id}
            className={`flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm ${r.reportes > 0 && !r.oculta ? "border-2 border-amber-300" : ""} ${r.oculta ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/panel/c/${r.cancha_id}`} className="block truncate font-bold hover:underline">
                  {r.cancha_nombre}
                </Link>
                <p className="text-xs text-[#5A5A5A]">
                  {r.nombre || "Jugador"} · {fmtFecha(r.created_at, { day: "numeric", month: "short" })}
                </p>
              </div>
              {r.reportes > 0 && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                  ⚠ {r.reportes} reporte{r.reportes === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <Estrellas valor={r.estrellas} />
            {r.comentario && <p>{r.comentario}</p>}
            {(r.motivos ?? []).length > 0 && (
              <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">Motivos: {(r.motivos ?? []).join(" · ")}</p>
            )}
            <button
              type="button"
              onClick={() => alternar(r)}
              className={`self-end rounded-lg px-3 py-1.5 text-xs font-bold ${r.oculta ? "bg-[#0A3D2E] text-white" : "text-red-700 hover:bg-red-50"}`}
            >
              {r.oculta ? "Volver a mostrar" : "Ocultar reseña"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
