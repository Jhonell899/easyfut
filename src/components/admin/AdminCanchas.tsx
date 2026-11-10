"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { etiquetaDeporte } from "@/components/TarjetaCancha";
import { fmtFecha } from "@/lib/horario";
import { refrescarPublico } from "@/app/panel/acciones";

type CanchaAdmin = {
  id: string;
  nombre: string;
  slug: string;
  distrito: string;
  deporte: string;
  modalidades: number[] | null;
  activa: boolean;
  foto: string | null;
  creada: string;
  dueno_id: string;
  dueno_nombre: string | null;
  dueno_correo: string;
  dueno_whatsapp: string | null;
  franjas: number;
  tiene_pagos: boolean;
  proximas: number;
  por_confirmar: number;
  ultima_reserva: string | null;
};

type Filtro = "todas" | "publicadas" | "pausadas" | "revisar";

/** Problemas que impiden que una cancha funcione bien. */
function problemas(c: CanchaAdmin): string[] {
  const p: string[] = [];
  if (!c.dueno_whatsapp) p.push("Dueño sin WhatsApp confirmado");
  if (c.franjas === 0) p.push("Sin horarios");
  if (!c.tiene_pagos) p.push("Sin medios de pago");
  if (!c.foto) p.push("Sin fotos");
  return p;
}

function traducir(msg: string) {
  if (/sin_permiso/.test(msg)) return "Tu cuenta no es administradora.";
  if (/admin_canchas|does not exist|schema cache/i.test(msg)) return "Falta ejecutar la migración 012 en Supabase.";
  return "No se pudo completar. Inténtalo de nuevo.";
}

/** Todas las canchas de EasyFut con acciones rápidas para el administrador. */
export default function AdminCanchas() {
  const [lista, setLista] = useState<CanchaAdmin[] | null>(null);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabaseNavegador()!.rpc("admin_canchas");
    if (error) setError(traducir(error.message));
    else setError(null);
    setLista((data ?? []) as CanchaAdmin[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function alternar(c: CanchaAdmin) {
    const nuevo = !c.activa;
    if (!nuevo && !confirm(`¿Pausar "${c.nombre}"? Dejará de aparecer y nadie podrá reservarla.`)) return;
    setOcupado(c.id);
    const { error } = await supabaseNavegador()!.from("canchas").update({ activa: nuevo }).eq("id", c.id);
    setOcupado(null);
    if (error) return setError(traducir(error.message));
    await refrescarPublico(c.slug);
    setLista((l) => l?.map((x) => (x.id === c.id ? { ...x, activa: nuevo } : x)) ?? null);
  }

  const q = buscar.trim().toLowerCase();
  const todas = lista ?? [];
  const visibles = todas.filter((c) => {
    if (filtro === "publicadas" && !c.activa) return false;
    if (filtro === "pausadas" && c.activa) return false;
    if (filtro === "revisar" && problemas(c).length === 0) return false;
    return (
      !q ||
      c.nombre.toLowerCase().includes(q) ||
      c.distrito.toLowerCase().includes(q) ||
      (c.dueno_nombre ?? "").toLowerCase().includes(q) ||
      c.dueno_correo.toLowerCase().includes(q)
    );
  });

  const conteos: Record<Filtro, number> = {
    todas: todas.length,
    publicadas: todas.filter((c) => c.activa).length,
    pausadas: todas.filter((c) => !c.activa).length,
    revisar: todas.filter((c) => problemas(c).length > 0).length,
  };
  const FILTROS: { clave: Filtro; texto: string }[] = [
    { clave: "todas", texto: "Todas" },
    { clave: "publicadas", texto: "Publicadas" },
    { clave: "pausadas", texto: "Pausadas" },
    { clave: "revisar", texto: "Por revisar" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2 text-center">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            type="button"
            onClick={() => setFiltro(f.clave)}
            className={`rounded-2xl p-2.5 shadow-sm ${filtro === f.clave ? "bg-[#0A3D2E] text-white" : "bg-white"}`}
          >
            <p className={`text-xl font-extrabold ${f.clave === "revisar" && conteos.revisar && filtro !== f.clave ? "text-amber-600" : ""}`}>
              {lista ? conteos[f.clave] : "–"}
            </p>
            <p className={`text-[11px] ${filtro === f.clave ? "text-white/70" : "text-[#5A5A5A]"}`}>{f.texto}</p>
          </button>
        ))}
      </div>

      <input
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por cancha, distrito o dueño"
        className="rounded-xl border border-[#E3E3E3] bg-white px-3 py-3 text-base outline-none focus:border-[#6D28D9]"
      />

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {lista === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white" />
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">No hay canchas{q ? " con esa búsqueda" : ""}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((c) => {
            const p = problemas(c);
            return (
              <li key={c.id} className="flex flex-col gap-3 rounded-2xl bg-white p-3 text-sm shadow-sm">
                <div className="flex gap-3">
                  {c.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.foto} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="fondo-cancha h-16 w-16 shrink-0 rounded-xl" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-bold">{c.nombre}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          c.activa ? "bg-[#EDE9FE] text-[#6D28D9]" : "bg-[#F4F4F4] text-[#5A5A5A]"
                        }`}
                      >
                        {c.activa ? "Publicada" : "Pausada"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[#5A5A5A]">
                      {etiquetaDeporte(c.deporte, c.modalidades)} · {c.distrito}
                    </p>
                    <p className="truncate text-xs text-[#5A5A5A]">
                      {c.dueno_nombre ?? "Sin nombre"} · {c.dueno_correo}
                      {c.dueno_whatsapp && (
                        <>
                          {" · "}
                          <a href={`https://wa.me/51${c.dueno_whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-[#128C4A]">
                            WhatsApp
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 text-[11px]">
                  <span className="rounded-full bg-[#F4F4F4] px-2 py-0.5">{c.proximas} próximas</span>
                  {c.por_confirmar > 0 && (
                    <span className="rounded-full bg-[#18A058] px-2 py-0.5 font-bold text-white">{c.por_confirmar} por confirmar</span>
                  )}
                  <span className="rounded-full bg-[#F4F4F4] px-2 py-0.5">
                    {c.ultima_reserva ? `Última reserva ${fmtFecha(c.ultima_reserva, { day: "numeric", month: "short" })}` : "Sin reservas"}
                  </span>
                  {p.map((x) => (
                    <span key={x} className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-800">
                      ⚠ {x}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  <Link href={`/panel/c/${c.id}`} className="rounded-lg bg-[#6D28D9] py-2 text-center text-xs font-bold text-white">
                    Gestionar
                  </Link>
                  <Link href={`/panel/agenda?d=${c.dueno_id}`} className="rounded-lg border border-[#E3E3E3] py-2 text-center text-xs font-bold">
                    Agenda
                  </Link>
                  <Link
                    href={`/c/${c.slug}`}
                    target="_blank"
                    className={`rounded-lg border border-[#E3E3E3] py-2 text-center text-xs font-bold ${c.activa ? "" : "pointer-events-none opacity-40"}`}
                  >
                    Ver
                  </Link>
                  <button
                    type="button"
                    onClick={() => alternar(c)}
                    disabled={ocupado === c.id}
                    className={`rounded-lg py-2 text-xs font-bold disabled:opacity-50 ${
                      c.activa ? "text-red-700 hover:bg-red-50" : "bg-[#0A3D2E] text-white"
                    }`}
                  >
                    {c.activa ? "Pausar" : "Publicar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
