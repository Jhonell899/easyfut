"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";
import Estrellas from "@/components/Estrellas";

type Resena = {
  id: string;
  estrellas: number;
  comentario: string | null;
  nombre: string | null;
  respuesta: string | null;
  oculta: boolean;
  created_at: string;
};

/** Reseñas de una cancha para su dueño, con la opción de responder. */
export default function ResenasDueno({ canchaId }: { canchaId: string }) {
  const [lista, setLista] = useState<Resena[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabaseNavegador()!
      .from("resenas")
      .select("id, estrellas, comentario, nombre, respuesta, oculta, created_at")
      .eq("cancha_id", canchaId)
      .order("created_at", { ascending: false });
    if (error) setError("Falta ejecutar la migración 017 en Supabase.");
    setLista((data ?? []) as Resena[]);
  }, [canchaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function responder(r: Resena) {
    setOcupado(r.id);
    const { error } = await supabaseNavegador()!.rpc("responder_resena", {
      p_id: r.id,
      p_texto: borradores[r.id] ?? r.respuesta ?? "",
    });
    setOcupado(null);
    if (error) return setError("No se pudo guardar la respuesta.");
    setBorradores((b) => {
      const c = { ...b };
      delete c[r.id];
      return c;
    });
    cargar();
  }

  if (lista === null) return <div className="h-24 animate-pulse rounded-2xl bg-white" />;

  const visibles = lista.filter((r) => !r.oculta);
  const promedio = visibles.length ? visibles.reduce((s, r) => s + r.estrellas, 0) / visibles.length : 0;
  const sinResponder = visibles.filter((r) => !r.respuesta).length;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {visibles.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <p className="text-3xl font-extrabold">{promedio.toFixed(1)}</p>
            <Estrellas valor={promedio} />
          </div>
          <p className="text-right text-sm text-[#5A5A5A]">
            {visibles.length} reseña{visibles.length === 1 ? "" : "s"}
            {sinResponder > 0 && (
              <span className="block font-bold text-[#6D28D9]">
                {sinResponder} sin responder
              </span>
            )}
          </p>
        </div>
      )}

      {lista.length === 0 && !error && (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">
          Aún no tienes reseñas. Los jugadores pueden calificar después de jugar con una reserva pagada.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {lista.map((r) => {
          const texto = borradores[r.id] ?? r.respuesta ?? "";
          const cambiado = texto !== (r.respuesta ?? "");
          return (
            <li key={r.id} className={`flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm ${r.oculta ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{r.nombre || "Jugador"}</span>
                <span className="text-xs text-[#8A968F]">{fmtFecha(r.created_at, { day: "numeric", month: "short" })}</span>
              </div>
              <Estrellas valor={r.estrellas} />
              {r.comentario && <p className="text-[#1B1B1B]">{r.comentario}</p>}
              {r.oculta && <p className="text-xs font-bold text-red-700">Oculta por EasyFut</p>}
              <textarea
                value={texto}
                onChange={(e) => setBorradores({ ...borradores, [r.id]: e.target.value.slice(0, 500) })}
                rows={2}
                placeholder="Responde con amabilidad: agradece o explica qué mejoraste."
                className="rounded-xl border border-[#E3E3E3] px-3 py-2 text-sm outline-none focus:border-[#6D28D9]"
              />
              {cambiado && (
                <button
                  type="button"
                  onClick={() => responder(r)}
                  disabled={ocupado === r.id}
                  className="self-end rounded-lg bg-[#6D28D9] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {ocupado === r.id ? "Guardando…" : r.respuesta ? "Actualizar respuesta" : "Publicar respuesta"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
