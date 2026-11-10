"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";

type Cliente = {
  celular: string;
  nombre: string | null;
  total: number;
  pagadas: number;
  vencidas: number;
  canceladas: number;
  ultima: string;
  conexiones: number;
  bloqueado: boolean;
  bloqueo_hasta: string | null;
  bloqueo_motivo: string | null;
};

const DURACIONES = [
  { texto: "7 días", dias: 7 },
  { texto: "30 días", dias: 30 },
  { texto: "Permanente", dias: null },
];

function traducir(msg: string) {
  if (/sin_permiso/.test(msg)) return "Tu cuenta no es administradora.";
  if (/admin_clientes|admin_bloquear|does not exist|schema cache/i.test(msg)) return "Falta ejecutar la migración 009 en Supabase.";
  return "No se pudo completar. Inténtalo de nuevo.";
}

/** Historial de todos los clientes de EasyFut y bloqueo en toda la plataforma. */
export default function AdminClientes() {
  const [lista, setLista] = useState<Cliente[] | null>(null);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "riesgo" | "bloqueados">("todos");
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async (q: string) => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("admin_clientes", { p_buscar: q || null });
    if (error) setError(traducir(error.message));
    else setError(null);
    setLista((data ?? []) as Cliente[]);
  }, []);

  // Busca al dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => cargar(buscar.trim()), 300);
    return () => clearTimeout(t);
  }, [buscar, cargar]);

  async function bloquear(c: Cliente, dias: number | null) {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(true);
    const { error } = await supabase.rpc("admin_bloquear_cliente", { p_celular: c.celular, p_motivo: motivo, p_dias: dias });
    setOcupado(false);
    if (error) return setError(traducir(error.message));
    setAbierto(null);
    setMotivo("");
    cargar(buscar.trim());
  }

  async function desbloquear(c: Cliente) {
    if (!confirm(`¿Desbloquear +51 ${c.celular} en toda EasyFut?`)) return;
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_desbloquear_cliente", { p_celular: c.celular });
    if (error) return setError(traducir(error.message));
    cargar(buscar.trim());
  }

  const visibles = (lista ?? []).filter((c) =>
    filtro === "riesgo" ? c.vencidas >= 2 : filtro === "bloqueados" ? c.bloqueado : true
  );
  const enRiesgo = (lista ?? []).filter((c) => c.vencidas >= 2).length;
  const bloqueados = (lista ?? []).filter((c) => c.bloqueado).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { clave: "todos", valor: lista?.length, texto: "Clientes" },
          { clave: "riesgo", valor: enRiesgo, texto: "En riesgo", alerta: enRiesgo > 0 },
          { clave: "bloqueados", valor: bloqueados, texto: "Bloqueados" },
        ].map((d) => (
          <button
            key={d.clave}
            type="button"
            onClick={() => setFiltro(d.clave as typeof filtro)}
            className={`rounded-2xl p-3 shadow-sm ${filtro === d.clave ? "bg-[#1B1B1B] text-white" : "bg-white"}`}
          >
            <p className={`text-2xl font-extrabold ${d.alerta && filtro !== d.clave ? "text-amber-600" : ""}`}>
              {lista ? d.valor : "–"}
            </p>
            <p className={`text-xs ${filtro === d.clave ? "text-white/70" : "text-[#5A5A5A]"}`}>{d.texto}</p>
          </button>
        ))}
      </div>

      <input
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por celular o nombre"
        className="rounded-xl border border-[#E3E3E3] bg-white px-3 py-3 text-base outline-none focus:border-[#0B6E4F]"
      />

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {lista === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white" />
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">No hay clientes{buscar ? " con esa búsqueda" : ""}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((c) => (
            <li key={c.celular} className={`flex flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm ${c.bloqueado ? "border-2 border-red-200" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{c.nombre ?? "Sin nombre"}</p>
                  <a
                    href={`https://wa.me/51${c.celular}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#128C4A] underline-offset-2 hover:underline"
                  >
                    +51 {c.celular}
                  </a>
                  <p className="text-xs text-[#8A968F]">
                    Última reserva {fmtFecha(c.ultima, { day: "numeric", month: "short" })} · {c.conexiones} conexión
                    {c.conexiones === 1 ? "" : "es"}
                  </p>
                </div>
                {c.bloqueado ? (
                  <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    ⛔ {c.bloqueo_hasta ? `hasta ${fmtFecha(c.bloqueo_hasta, { day: "numeric", month: "short" })}` : "Bloqueado"}
                  </span>
                ) : (
                  c.vencidas >= 2 && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">En riesgo</span>
                  )
                )}
              </div>

              <div className="grid grid-cols-4 gap-1 text-center text-xs">
                <Cifra valor={c.total} texto="Total" />
                <Cifra valor={c.pagadas} texto="Pagadas" color="text-[#0B6E4F]" />
                <Cifra valor={c.vencidas} texto="Vencidas" color={c.vencidas ? "text-amber-700" : undefined} />
                <Cifra valor={c.canceladas} texto="Canceladas" />
              </div>

              {c.bloqueado ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[#5A5A5A]">{c.bloqueo_motivo ?? "Sin motivo"}</span>
                  <button type="button" onClick={() => desbloquear(c)} className="shrink-0 rounded-lg border border-[#E3E3E3] px-3 py-1.5 text-xs font-bold">
                    Desbloquear
                  </button>
                </div>
              ) : abierto === c.celular ? (
                <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-3">
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo (opcional)"
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 outline-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    {DURACIONES.map((d) => (
                      <button
                        key={d.texto}
                        type="button"
                        disabled={ocupado}
                        onClick={() => bloquear(c, d.dias)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      >
                        Bloquear {d.texto.toLowerCase()}
                      </button>
                    ))}
                    <button type="button" onClick={() => setAbierto(null)} className="px-2 text-xs text-[#5A5A5A]">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(c.celular);
                    setMotivo("");
                  }}
                  className="self-end rounded-lg px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                >
                  Bloquear en EasyFut
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cifra({ valor, texto, color }: { valor: number; texto: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[#F7F8F7] py-1.5">
      <p className={`text-base font-extrabold ${color ?? "text-[#1B1B1B]"}`}>{valor}</p>
      <p className="text-[10px] text-[#5A5A5A]">{texto}</p>
    </div>
  );
}
