"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import AdminRentadores from "@/components/admin/AdminRentadores";
import AdminClientes from "@/components/admin/AdminClientes";
import AdminCanchas from "@/components/admin/AdminCanchas";
import AdminCambiosPagos from "@/components/admin/AdminCambiosPagos";
import AdminResenas from "@/components/admin/AdminResenas";
import AdminAccesos from "@/components/admin/AdminAccesos";
import AdminRecargas from "@/components/admin/AdminRecargas";

type Clave = "recargas" | "pagos" | "canchas" | "rentadores" | "clientes" | "resenas" | "accesos";

const SECCIONES: { clave: Clave; icono: string; titulo: string; detalle: string; grupo: string }[] = [
  { clave: "recargas", icono: "💰", titulo: "Recargas", detalle: "Aprueba los pagos (Yape o BCP) y mira el saldo de cada dueño", grupo: "Dinero" },
  { clave: "pagos", icono: "🔁", titulo: "Cambios de pago", detalle: "Quién cambió el Yape o la cuenta de una cancha", grupo: "Dinero" },
  { clave: "canchas", icono: "⚽", titulo: "Canchas", detalle: "Publica, pausa y revisa todas las canchas", grupo: "Canchas y personas" },
  { clave: "rentadores", icono: "🏟️", titulo: "Dueños", detalle: "Confirma su WhatsApp para que puedan publicar", grupo: "Canchas y personas" },
  { clave: "clientes", icono: "👤", titulo: "Jugadores", detalle: "Historial de reservas y bloqueos", grupo: "Canchas y personas" },
  { clave: "resenas", icono: "⭐", titulo: "Reseñas", detalle: "Oculta las reseñas falsas o denunciadas", grupo: "Confianza y seguridad" },
  { clave: "accesos", icono: "🔒", titulo: "Accesos", detalle: "Dispositivos, IPs y actividad rara", grupo: "Confianza y seguridad" },
];

const GRUPOS = ["Dinero", "Canchas y personas", "Confianza y seguridad"];

type Pendientes = Partial<Record<Clave, number>>;

/** Qué hay que revisar en cada sección, en palabras simples. */
const AVISOS: { clave: Clave; texto: (n: number) => string; ayuda: string }[] = [
  {
    clave: "recargas",
    texto: (n) => `${n} recarga${n === 1 ? "" : "s"} por aprobar`,
    ayuda: "Busca cada pago en tu Yape o en tu BCP y apruébalo o recházalo.",
  },
  {
    clave: "rentadores",
    texto: (n) => `${n} dueño${n === 1 ? "" : "s"} sin WhatsApp confirmado`,
    ayuda: "No pueden publicar canchas hasta que lo confirmes.",
  },
  {
    clave: "resenas",
    texto: (n) => `${n} reseña${n === 1 ? "" : "s"} denunciada${n === 1 ? "" : "s"}`,
    ayuda: "Revisa si son falsas y ocúltalas.",
  },
  {
    clave: "canchas",
    texto: (n) => `${n} cancha${n === 1 ? "" : "s"} con algo incompleto`,
    ayuda: "Sin fotos, horarios, medios de pago o WhatsApp del dueño.",
  },
];

function leerSeccion(): Clave | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.slice(1);
  return SECCIONES.some((s) => s.clave === h) ? (h as Clave) : null;
}

/** Inicio del administrador: lo pendiente arriba y las secciones agrupadas abajo. */
export default function PestanasAdmin() {
  const [seccion, setSeccion] = useState<Clave | null>(null);
  const [pendientes, setPendientes] = useState<Pendientes | null>(null);

  useEffect(() => {
    setSeccion(leerSeccion());
    const alCambiar = () => setSeccion(leerSeccion());
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);

  function abrir(clave: Clave | null) {
    window.location.hash = clave ?? "";
    setSeccion(clave);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const contar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const [rec, ren, res, can] = await Promise.all([
      supabase.rpc("admin_recargas"),
      supabase.rpc("admin_rentadores"),
      supabase.rpc("admin_resenas"),
      supabase.rpc("admin_canchas"),
    ]);
    type Fila = Record<string, unknown>;
    const filas = (r: { data: unknown }) => (Array.isArray(r.data) ? (r.data as Fila[]) : []);
    setPendientes({
      recargas: filas(rec).filter((r) => r.estado === "pendiente").length,
      rentadores: filas(ren).filter((r) => !r.celular_verificado).length,
      resenas: filas(res).filter((r) => Number(r.reportes) > 0 && !r.oculta).length,
      canchas: filas(can).filter(
        (c) => !c.dueno_whatsapp || Number(c.tarifas_horarias) === 0 || !c.tiene_pagos || !c.foto
      ).length,
    });
  }, []);

  // Se vuelve a contar cada vez que regresas al inicio
  useEffect(() => {
    if (seccion === null) contar();
  }, [seccion, contar]);

  const actual = SECCIONES.find((s) => s.clave === seccion);

  if (actual) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => abrir(null)}
          className="self-start rounded-full bg-white px-4 py-2 text-sm font-bold text-[#6D28D9] shadow-sm"
        >
          ← Inicio del admin
        </button>
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EDE9FE] text-2xl" aria-hidden="true">
            {actual.icono}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">{actual.titulo}</h2>
            <p className="text-sm text-[#5A5A5A]">{actual.detalle}</p>
          </div>
        </div>
        {actual.clave === "recargas" ? (
          <AdminRecargas />
        ) : actual.clave === "pagos" ? (
          <AdminCambiosPagos />
        ) : actual.clave === "canchas" ? (
          <AdminCanchas />
        ) : actual.clave === "rentadores" ? (
          <AdminRentadores />
        ) : actual.clave === "clientes" ? (
          <AdminClientes />
        ) : actual.clave === "resenas" ? (
          <AdminResenas />
        ) : (
          <AdminAccesos />
        )}
      </div>
    );
  }

  const avisos = AVISOS.filter((a) => (pendientes?.[a.clave] ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Lo que hay que revisar */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Para revisar</h2>
        {pendientes === null ? (
          <div className="h-20 animate-pulse rounded-2xl bg-white" />
        ) : avisos.length === 0 ? (
          <p className="flex items-center gap-3 rounded-2xl bg-[#DCF5EA] p-4 text-sm font-bold text-[#0F7A55]">
            <span className="text-2xl" aria-hidden="true">
              ✓
            </span>
            Todo al día. No hay nada pendiente.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {avisos.map((a) => {
              const n = pendientes[a.clave] ?? 0;
              return (
                <li key={a.clave}>
                  <button
                    type="button"
                    onClick={() => abrir(a.clave)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500 text-lg font-extrabold text-white">
                      {n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-amber-900">{a.texto(n)}</span>
                      <span className="block text-xs text-amber-800">{a.ayuda}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-amber-900" aria-hidden="true">
                      Revisar →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Todas las secciones, agrupadas */}
      {GRUPOS.map((grupo) => (
        <section key={grupo} className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-[#5A5A5A]">{grupo}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SECCIONES.filter((s) => s.grupo === grupo).map((s) => {
              const n = pendientes?.[s.clave] ?? 0;
              return (
                <button
                  key={s.clave}
                  type="button"
                  onClick={() => abrir(s.clave)}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm hover:bg-[#FAFAFA]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EDE9FE] text-xl" aria-hidden="true">
                    {s.icono}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold">
                      {s.titulo}
                      {n > 0 && (
                        <span className="rounded-full bg-amber-500 px-2 text-xs font-extrabold text-white">{n}</span>
                      )}
                    </span>
                    <span className="block text-xs text-[#5A5A5A]">{s.detalle}</span>
                  </span>
                  <span className="shrink-0 text-[#C4B5FD]" aria-hidden="true">
                    ›
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
