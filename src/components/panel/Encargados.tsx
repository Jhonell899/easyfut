"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

type Encargado = { id: string; correo: string; nombre: string | null; created_at: string };

/** El dueño invita encargados por correo y los quita cuando quiera. */
export default function Encargados({ duenoId }: { duenoId: string }) {
  const [lista, setLista] = useState<Encargado[] | null>(null);
  const [correo, setCorreo] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabaseNavegador()!
      .from("encargados")
      .select("id, correo, nombre, created_at")
      .eq("dueno_id", duenoId)
      .order("created_at");
    if (error) setError(/encargados/.test(error.message) ? "Falta ejecutar la migración 011 en Supabase." : "No pudimos cargar los encargados.");
    setLista((data ?? []) as Encargado[]);
  }, [duenoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const correoValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim());

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    if (!correoValido) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    const limpio = correo.trim().toLowerCase();
    const { error } = await supabaseNavegador()!
      .from("encargados")
      .insert({ dueno_id: duenoId, correo: limpio, nombre: nombre.trim() || null });
    setOcupado(false);
    if (error) return setError(error.code === "23505" ? "Ese correo ya es encargado." : "No se pudo agregar. ¿Ejecutaste la migración 011?");
    setAviso(
      `Listo. Pídele a ${nombre.trim() || "tu encargado"} que entre a EasyFut con ${limpio} (o que cree su cuenta con ese correo). Verá "Panel de encargado" en su menú.`
    );
    setCorreo("");
    setNombre("");
    cargar();
  }

  async function quitar(x: Encargado) {
    if (!confirm(`¿Quitar a ${x.nombre ?? x.correo}? Ya no podrá ver ni gestionar tus reservas.`)) return;
    await supabaseNavegador()!.from("encargados").delete().eq("id", x.id);
    cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-bold">Invitar encargado</h2>
          <p className="text-sm text-[#5A5A5A]">
            Podrá ver la agenda de todas tus canchas, confirmar pagos, cancelar, registrar reservas presenciales y bloquear
            horarios. <strong>No</strong> podrá cambiar precios, horarios, medios de pago ni datos de tus canchas.
          </p>
        </div>
        <form onSubmit={invitar} className="flex flex-col gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej. Carlos, turno noche)"
            maxLength={60}
            className="rounded-xl border border-[#E3E3E3] px-3 py-3 text-base outline-none focus:border-[#0B6E4F]"
          />
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="Correo con el que entrará a EasyFut"
            autoComplete="off"
            className="rounded-xl border border-[#E3E3E3] px-3 py-3 text-base outline-none focus:border-[#0B6E4F]"
          />
          <button
            type="submit"
            disabled={!correoValido || ocupado}
            className="rounded-xl bg-[#0B6E4F] py-3 font-bold text-white disabled:opacity-50"
          >
            {ocupado ? "Agregando…" : "Agregar encargado"}
          </button>
        </form>
        {aviso && <p className="rounded-xl bg-[#E6EEEA] p-3 text-sm text-[#0B6E4F]">{aviso}</p>}
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Tus encargados</h2>
        {lista === null ? (
          <div className="h-20 animate-pulse rounded-2xl bg-white" />
        ) : lista.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">Aún no tienes encargados.</p>
        ) : (
          <ul className="divide-y divide-[#EFEFEF] overflow-hidden rounded-2xl bg-white shadow-sm">
            {lista.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-bold">{x.nombre ?? "Encargado"}</span>
                  <span className="block truncate text-[#5A5A5A]">{x.correo}</span>
                </span>
                <button type="button" onClick={() => quitar(x)} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
