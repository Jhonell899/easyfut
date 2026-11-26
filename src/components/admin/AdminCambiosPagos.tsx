"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";

type Cambio = {
  id: string;
  cuando: string;
  cancha_id: string;
  cancha_nombre: string;
  dueno_nombre: string | null;
  autor_nombre: string | null;
  autor_correo: string | null;
  autor_es_dueno: boolean | null;
  antes: Record<string, string> | null;
  despues: Record<string, string>;
};

const CAMPOS: { clave: string; texto: string }[] = [
  { clave: "yape", texto: "Yape" },
  { clave: "plin", texto: "Plin" },
  { clave: "titular", texto: "Titular" },
  { clave: "banco", texto: "Banco" },
  { clave: "cuenta", texto: "Cuenta" },
  { clave: "cci", texto: "CCI" },
  { clave: "qr", texto: "QR" },
];

/** Historial de cambios en los medios de pago de todas las canchas. */
export default function AdminCambiosPagos() {
  const [lista, setLista] = useState<Cambio[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseNavegador()
      ?.rpc("admin_historial_medios_pago")
      .then(({ data, error }) => {
        if (error)
          setError(
            /sin_permiso/.test(error.message)
              ? "Tu cuenta no es administradora."
              : "Falta ejecutar la migración 015 en Supabase."
          );
        setLista((data ?? []) as Cambio[]);
      });
  }, []);

  if (lista === null) return <div className="h-32 animate-pulse rounded-2xl bg-white" />;

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A] shadow-sm">
        Cada vez que alguien cambia a dónde llega el dinero de una cancha queda anotado aquí. Fíjate sobre todo en los
        cambios hechos por <strong>alguien que no es el dueño</strong> y en los que cambian el número o el titular.
      </p>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!error && lista.length === 0 && (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">Todavía no hay cambios registrados.</p>
      )}

      <ul className="flex flex-col gap-2">
        {lista.map((c) => {
          const primera = c.antes === null || Object.keys(c.antes).length === 0;
          const cambios = CAMPOS.filter((f) => (c.antes?.[f.clave] ?? "") !== (c.despues?.[f.clave] ?? ""));
          const ajeno = c.autor_es_dueno === false;
          return (
            <li
              key={c.id}
              className={`flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm ${ajeno ? "border-2 border-amber-300" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/panel/c/${c.cancha_id}`} className="block truncate font-bold hover:underline">
                    {c.cancha_nombre}
                  </Link>
                  <p className="truncate text-xs text-[#5A5A5A]">
                    Dueño: {c.dueno_nombre ?? "sin nombre"} · Cambió: {c.autor_nombre ?? c.autor_correo ?? "desconocido"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-[#8A968F]">
                    {fmtFecha(c.cuando, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                  {primera ? (
                    <span className="rounded-full bg-[#F4F4F4] px-2 py-0.5 text-[11px] font-bold text-[#5A5A5A]">Primera vez</span>
                  ) : ajeno ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">⚠ No fue el dueño</span>
                  ) : (
                    <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[11px] font-bold text-[#6D28D9]">Cambio</span>
                  )}
                </div>
              </div>

              <ul className="flex flex-col gap-1 rounded-xl bg-[#F7F8F7] p-3 text-xs">
                {cambios.length === 0 && <li className="text-[#8A968F]">Sin diferencias visibles.</li>}
                {cambios.map((f) => {
                  const antes = c.antes?.[f.clave];
                  const despues = c.despues?.[f.clave];
                  const valor = (v?: string) => (f.clave === "qr" ? (v ? "imagen" : "—") : v || "—");
                  return (
                    <li key={f.clave} className="flex flex-wrap items-center gap-x-2">
                      <span className="w-14 shrink-0 font-bold text-[#5A5A5A]">{f.texto}</span>
                      {!primera && <span className="text-red-700 line-through">{valor(antes)}</span>}
                      {!primera && <span aria-hidden="true">→</span>}
                      <span className="font-bold text-[#0F7A55]">{valor(despues)}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
