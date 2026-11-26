"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";

type Reporte = {
  id: string;
  chat_id: string;
  motivo: string;
  detalle: string | null;
  estado: "pendiente" | "revisado";
  nota_admin: string | null;
  created_at: string;
  reporta_nombre: string | null;
  reporta_correo: string | null;
  dueno_nombre: string | null;
  dueno_correo: string | null;
  cliente_nombre: string | null;
  cliente_correo: string | null;
  chat_bloqueado: boolean;
  mensajes: number;
};
type Mensaje = { id: string; autor: string; autor_nombre: string | null; texto: string; created_at: string };

const MOTIVO: Record<string, string> = {
  acoso: "Insultos o acoso",
  estafa: "Estafa / pide plata por fuera",
  spam: "Spam o publicidad",
  otro: "Otro motivo",
};

const fecha = (iso: string) => fmtFecha(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** Chats reportados por dueños o jugadores. Solo aquí el admin puede leer un chat. */
export default function AdminChats() {
  const supabase = supabaseNavegador();
  const [reportes, setReportes] = useState<Reporte[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("admin_reportes_chat");
    if (error) {
      setError(/sin_permiso/.test(error.message) ? "Tu cuenta no es administradora." : "Falta ejecutar la migración 023 en Supabase.");
      return setReportes([]);
    }
    setReportes((data ?? []) as Reporte[]);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function verMensajes(r: Reporte) {
    if (!supabase) return;
    if (abierto === r.id) return setAbierto(null);
    setAbierto(r.id);
    setMensajes([]);
    const { data } = await supabase.rpc("admin_mensajes_chat", { p_chat: r.chat_id });
    setMensajes((data ?? []) as Mensaje[]);
  }

  async function revisar(r: Reporte, bloquear: boolean | null) {
    if (!supabase) return;
    const pregunta =
      bloquear === true
        ? "Se cerrará el chat para siempre: ninguno de los dos podrá escribir. Nota interna (opcional):"
        : bloquear === false
          ? "Se volverá a abrir el chat. Nota interna (opcional):"
          : "Nota interna (opcional):";
    const nota = window.prompt(pregunta, "");
    if (nota === null) return;
    setOcupado(r.id);
    const { error } = await supabase.rpc("admin_revisar_reporte_chat", { p_id: r.id, p_nota: nota, p_bloquear: bloquear });
    setOcupado(null);
    if (error) window.alert("No se pudo guardar.");
    cargar();
  }

  if (reportes === null) return <div className="h-32 animate-pulse rounded-2xl bg-white" />;

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A] shadow-sm">
        Los chats son privados entre el dueño y el jugador. Solo puedes leer los que alguien reportó. Si hay acoso o estafa,
        cierra el chat; si es grave, bloquea también a la persona desde <strong>Jugadores</strong> o <strong>Dueños</strong>.
      </p>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {reportes.length === 0 && !error && (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A] shadow-sm">No hay chats reportados.</p>
      )}

      <ul className="flex flex-col gap-2">
        {reportes.map((r) => (
          <li
            key={r.id}
            className={`flex flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm ${
              r.estado === "pendiente" ? "border border-amber-200" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">{MOTIVO[r.motivo] ?? r.motivo}</p>
                {r.detalle && <p className="mt-1 whitespace-pre-wrap text-[#4A4A4A]">“{r.detalle}”</p>}
                <p className="mt-1 text-xs text-[#5A5A5A]">
                  Reportó {r.reporta_nombre ?? r.reporta_correo ?? "—"} · {fecha(r.created_at)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  r.estado === "pendiente" ? "bg-amber-50 text-amber-800" : "bg-[#DCF5EA] text-[#0F7A55]"
                }`}
              >
                {r.estado === "pendiente" ? "Por revisar" : "Revisado"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F4F4F4] p-3 text-xs">
              <p className="min-w-0">
                <span className="block text-[#5A5A5A]">Dueño</span>
                <span className="block truncate font-bold">{r.dueno_nombre ?? "—"}</span>
                <span className="block truncate">{r.dueno_correo}</span>
              </p>
              <p className="min-w-0">
                <span className="block text-[#5A5A5A]">Jugador</span>
                <span className="block truncate font-bold">{r.cliente_nombre ?? "—"}</span>
                <span className="block truncate">{r.cliente_correo}</span>
              </p>
            </div>

            {r.nota_admin && <p className="text-xs text-[#5A5A5A]">Nota: {r.nota_admin}</p>}
            {r.chat_bloqueado && <p className="text-xs font-bold text-red-700">Chat cerrado por EasyFut</p>}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => verMensajes(r)}
                className="rounded-xl border border-[#6D28D9] px-3 py-2 text-xs font-bold text-[#6D28D9]"
              >
                {abierto === r.id ? "Ocultar mensajes" : `Ver mensajes (${r.mensajes})`}
              </button>
              {r.estado === "pendiente" && (
                <button
                  type="button"
                  disabled={ocupado === r.id}
                  onClick={() => revisar(r, null)}
                  className="rounded-xl bg-[#0F7A55] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  ✓ Revisado, todo bien
                </button>
              )}
              {r.chat_bloqueado ? (
                <button
                  type="button"
                  disabled={ocupado === r.id}
                  onClick={() => revisar(r, false)}
                  className="rounded-xl border border-[#E3E3E3] px-3 py-2 text-xs font-bold disabled:opacity-50"
                >
                  Reabrir chat
                </button>
              ) : (
                <button
                  type="button"
                  disabled={ocupado === r.id}
                  onClick={() => revisar(r, true)}
                  className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
                >
                  Cerrar el chat
                </button>
              )}
            </div>

            {abierto === r.id && (
              <div className="flex max-h-96 flex-col gap-1.5 overflow-y-auto rounded-xl bg-[#F3F1FA] p-3">
                {mensajes.length === 0 ? (
                  <p className="text-xs text-[#5A5A5A]">Cargando…</p>
                ) : (
                  mensajes.map((m) => (
                    <p key={m.id} className="text-xs">
                      <span className="font-bold">
                        {m.autor === "sistema" ? "EasyFut" : `${m.autor_nombre ?? m.autor} (${m.autor === "dueno" ? "dueño" : "jugador"})`}
                      </span>{" "}
                      <span className="text-[#8A968F]">{fecha(m.created_at)}</span>
                      <span className="block whitespace-pre-wrap break-words">{m.texto}</span>
                    </p>
                  ))
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
