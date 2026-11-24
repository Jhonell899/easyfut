"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";

type Dispositivo = {
  id: string;
  correo: string;
  nombre: string | null;
  creado: string;
  ultimo_uso: string;
  ip_inicial: string | null;
  ip_ultima: string | null;
  agente: string | null;
  revocado: boolean;
};

type Acceso = { id: string; cuando: string; correo: string; evento: string; ip: string | null; agente: string | null };

const EVENTOS: Record<string, { texto: string; clase: string }> = {
  confiado: { texto: "Dispositivo nuevo", clase: "bg-[#EDE9FE] text-[#6D28D9]" },
  ip_nueva: { texto: "IP distinta", clase: "bg-amber-100 text-amber-900" },
  revocado: { texto: "Revocado", clase: "bg-red-50 text-red-700" },
  limite: { texto: "Demasiados intentos", clase: "bg-red-600 text-white" },
};

const fecha = (iso: string) =>
  fmtFecha(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** "Chrome en Android" a partir del agente del navegador. */
function navegador(agente: string | null): string {
  if (!agente) return "Navegador desconocido";
  const so = /android/i.test(agente)
    ? "Android"
    : /iphone|ipad/i.test(agente)
      ? "iPhone"
      : /windows/i.test(agente)
        ? "Windows"
        : /mac os/i.test(agente)
          ? "Mac"
          : /linux/i.test(agente)
            ? "Linux"
            : "otro sistema";
  const nav = /edg\//i.test(agente)
    ? "Edge"
    : /chrome|crios/i.test(agente)
      ? "Chrome"
      : /firefox|fxios/i.test(agente)
        ? "Firefox"
        : /safari/i.test(agente)
          ? "Safari"
          : "navegador";
  return `${nav} en ${so}`;
}

/** Dispositivos de confianza y registro de accesos, con su IP, para revisar y revocar. */
export default function AdminAccesos() {
  const [dispositivos, setDispositivos] = useState<Dispositivo[] | null>(null);
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [vista, setVista] = useState<"dispositivos" | "registro">("dispositivos");
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = supabaseNavegador()!;
    const [d, a] = await Promise.all([supabase.rpc("admin_dispositivos"), supabase.rpc("admin_accesos")]);
    if (d.error)
      setError(/sin_permiso/.test(d.error.message) ? "Tu cuenta no es administradora." : "Falta ejecutar la migración 018 en Supabase.");
    setDispositivos((d.data ?? []) as Dispositivo[]);
    setAccesos((a.data ?? []) as Acceso[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function revocar(d: Dispositivo) {
    await supabaseNavegador()!.rpc("admin_revocar_dispositivo", { p_id: d.id });
    cargar();
  }

  if (dispositivos === null) return <div className="h-32 animate-pulse rounded-2xl bg-white" />;

  const q = buscar.trim().toLowerCase();
  const coincide = (...t: (string | null)[]) => !q || t.some((x) => x?.toLowerCase().includes(q));
  const listaD = dispositivos.filter((d) => coincide(d.correo, d.nombre, d.ip_inicial, d.ip_ultima));
  const listaA = accesos.filter((a) => coincide(a.correo, a.ip));
  const alertas = accesos.filter((a) => a.evento === "limite" || a.evento === "ip_nueva").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 text-center">
        {[
          { v: "dispositivos" as const, n: dispositivos.filter((d) => !d.revocado).length, t: "Dispositivos activos" },
          { v: "registro" as const, n: alertas, t: "Alertas recientes" },
        ].map((x) => (
          <button
            key={x.v}
            type="button"
            onClick={() => setVista(x.v)}
            className={`rounded-2xl p-3 shadow-sm ${vista === x.v ? "bg-[#0A3D2E] text-white" : "bg-white"}`}
          >
            <p className="text-2xl font-extrabold">{x.n}</p>
            <p className={`text-xs ${vista === x.v ? "text-white/70" : "text-[#5A5A5A]"}`}>{x.t}</p>
          </button>
        ))}
      </div>

      <input
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por correo, nombre o IP"
        className="rounded-xl border border-[#E3E3E3] bg-white px-3 py-3 text-base outline-none focus:border-[#6D28D9]"
      />

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {vista === "dispositivos" ? (
        <ul className="flex flex-col gap-2">
          {listaD.length === 0 && !error && (
            <li className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">Todavía no hay dispositivos de confianza.</li>
          )}
          {listaD.map((d) => (
            <li key={d.id} className={`flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm ${d.revocado ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{d.nombre ?? d.correo}</p>
                  <p className="truncate text-xs text-[#5A5A5A]">{d.correo}</p>
                </div>
                {d.revocado ? (
                  <span className="shrink-0 rounded-full bg-[#F4F4F4] px-2 py-0.5 text-[11px] font-bold text-[#5A5A5A]">Revocado o vencido</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => revocar(d)}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    Revocar
                  </button>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-[#F7F8F7] p-3 text-xs">
                <dt className="text-[#8A968F]">Dispositivo</dt>
                <dd className="truncate">{navegador(d.agente)}</dd>
                <dt className="text-[#8A968F]">IP al confiar</dt>
                <dd className="truncate font-mono">{d.ip_inicial ?? "—"}</dd>
                <dt className="text-[#8A968F]">Última IP</dt>
                <dd className={`truncate font-mono ${d.ip_ultima !== d.ip_inicial ? "font-bold text-amber-800" : ""}`}>
                  {d.ip_ultima ?? "—"}
                </dd>
                <dt className="text-[#8A968F]">Confiado</dt>
                <dd>{fecha(d.creado)}</dd>
                <dt className="text-[#8A968F]">Último uso</dt>
                <dd>{fecha(d.ultimo_uso)}</dd>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col divide-y divide-[#EFEFEF] overflow-hidden rounded-2xl bg-white shadow-sm">
          {listaA.length === 0 && <li className="p-4 text-sm text-[#5A5A5A]">Sin accesos registrados.</li>}
          {listaA.map((a) => {
            const e = EVENTOS[a.evento] ?? { texto: a.evento, clase: "bg-[#F4F4F4]" };
            return (
              <li key={a.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.correo}</p>
                  <p className="truncate text-xs text-[#5A5A5A]">
                    <span className="font-mono">{a.ip ?? "IP desconocida"}</span> · {navegador(a.agente)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${e.clase}`}>{e.texto}</span>
                  <span className="text-[11px] text-[#8A968F]">{fecha(a.cuando)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
