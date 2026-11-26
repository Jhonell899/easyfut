"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha, soles } from "@/lib/horario";

type Datos = {
  reserva_id: string;
  codigo: string;
  estado: string;
  inicio: string;
  fin: string;
  monto: number;
  cancha_nombre: string;
  cancha_direccion: string;
  cancha_slug: string;
  soy: "dueno" | "cliente";
  otra_nombre: string | null;
  otra_celular: string | null;
  abierto: boolean;
  cliente_pagadas: number | null;
  cliente_vencidas: number | null;
  cliente_canceladas: number | null;
  cliente_pagos_falsos: number | null;
};
type Mensaje = { id: string; autor: "cliente" | "dueno" | "sistema"; texto: string; created_at: string };

const ERRORES: Record<string, string> = {
  texto_invalido: "Escribe un mensaje de hasta 1000 caracteres.",
  chat_cerrado: "Este chat ya está cerrado.",
  sin_permiso: "No participas en este chat.",
  muy_rapido: "Estás enviando muy rápido. Espera un momento.",
};

const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
const dia = (iso: string) => fmtFecha(iso, { weekday: "short", day: "numeric", month: "short" });

/** Chat entre el cliente y el dueño de una reserva confirmada. */
export default function ChatReserva({ codigo }: { codigo: string }) {
  const supabase = supabaseNavegador();
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);

  // Datos de la reserva y de la otra persona
  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("datos_chat", { p_codigo: codigo }).then(({ data, error }) => {
      if (error) return setDatos(null);
      setDatos(((data ?? []) as Datos[])[0] ?? null);
    });
  }, [supabase, codigo]);

  const reservaId = datos?.reserva_id;

  const cargarMensajes = useCallback(async () => {
    if (!supabase || !reservaId) return;
    const { data } = await supabase
      .from("mensajes_reserva")
      .select("id, autor, texto, created_at")
      .eq("reserva_id", reservaId)
      .order("created_at")
      .limit(300);
    setMensajes((data ?? []) as Mensaje[]);
    supabase.rpc("marcar_chat_leido", { p_reserva: reservaId });
  }, [supabase, reservaId]);

  // Mensajes y nuevos mensajes en vivo
  useEffect(() => {
    if (!supabase || !reservaId) return;
    cargarMensajes();
    const canal = supabase
      .channel(`chat-${reservaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes_reserva", filter: `reserva_id=eq.${reservaId}` },
        (cambio) => {
          const nuevo = cambio.new as Mensaje;
          setMensajes((lista) => (lista.some((m) => m.id === nuevo.id) ? lista : [...lista, nuevo]));
          supabase.rpc("marcar_chat_leido", { p_reserva: reservaId });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, reservaId, cargarMensajes]);

  // Bajar al último mensaje
  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = texto.trim();
    if (!supabase || !reservaId || !limpio) return;
    setEnviando(true);
    setError(null);
    const { error } = await supabase.rpc("enviar_mensaje", { p_reserva: reservaId, p_texto: limpio });
    setEnviando(false);
    if (error) {
      const clave = Object.keys(ERRORES).find((k) => error.message.includes(k));
      return setError(clave ? ERRORES[clave] : "No se pudo enviar. Inténtalo de nuevo.");
    }
    setTexto("");
    cargarMensajes();
  }

  if (datos === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  if (datos === null)
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 text-sm shadow-sm">
        <p className="font-bold">Este chat todavía no está disponible</p>
        <p className="text-[#5A5A5A]">
          El chat se abre recién cuando el dueño confirma el pago de la reserva, y solo lo ven el cliente y el dueño de la
          cancha.
        </p>
        <Link href={`/r/${codigo}`} className="font-bold text-[#6D28D9]">
          Ver la reserva →
        </Link>
      </div>
    );

  const esDueno = datos.soy === "dueno";
  const celular = datos.otra_celular?.replace(/\D/g, "");

  return (
    <div className="flex flex-col gap-4">
      {/* Datos de la otra persona y de la reserva */}
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[#5A5A5A]">{esDueno ? "Cliente" : "Dueño de la cancha"}</p>
            <p className="truncate text-lg font-extrabold">{datos.otra_nombre ?? "Sin nombre"}</p>
            {celular && <p className="text-sm text-[#4A4A4A]">+51 {celular.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}</p>}
          </div>
          {celular && (
            <a
              href={`https://wa.me/51${celular}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-xl bg-[#DCF5EA] px-3 py-2 text-sm font-bold text-[#0F7A55]"
            >
              WhatsApp
            </a>
          )}
        </div>

        {esDueno && (
          <div className="flex flex-wrap gap-1 text-[11px]">
            <span className="rounded-full bg-[#DCF5EA] px-2 py-0.5 font-bold text-[#0F7A55]">
              {datos.cliente_pagadas ?? 0} pagadas
            </span>
            <span className="rounded-full bg-[#F4F4F4] px-2 py-0.5">{datos.cliente_vencidas ?? 0} vencidas</span>
            <span className="rounded-full bg-[#F4F4F4] px-2 py-0.5">{datos.cliente_canceladas ?? 0} canceladas</span>
            {Number(datos.cliente_pagos_falsos) > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">
                {datos.cliente_pagos_falsos} pagos que no llegaron
              </span>
            )}
          </div>
        )}

        <div className="rounded-xl bg-[#F4F4F4] p-3 text-sm">
          <p className="font-bold">{datos.cancha_nombre}</p>
          {!esDueno && <p className="text-[#5A5A5A]">{datos.cancha_direccion}</p>}
          <p className="first-letter:uppercase">
            {dia(datos.inicio)} · {hora(datos.inicio)}–{hora(datos.fin)} · {soles(Number(datos.monto))}
          </p>
          <Link href={`/r/${datos.codigo}`} className="text-xs font-bold text-[#6D28D9]">
            Reserva {datos.codigo} →
          </Link>
        </div>
      </section>

      {/* Mensajes */}
      <section aria-label="Mensajes" className="flex flex-col gap-2 pb-2">
        {mensajes.length === 0 && (
          <p className="text-center text-sm text-[#5A5A5A]">Aún no hay mensajes. ¡Escribe el primero!</p>
        )}
        {mensajes.map((m) =>
          m.autor === "sistema" ? (
            <p key={m.id} className="mx-auto max-w-[90%] rounded-xl bg-[#EDE9FE] px-3 py-2 text-center text-xs text-[#4C1D95]">
              {m.texto}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.autor === datos.soy ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  m.autor === datos.soy ? "rounded-br-md bg-[#6D28D9] text-white" : "rounded-bl-md bg-white text-[#1B1B1B]"
                }`}
              >
                {m.texto}
                <span className={`mt-1 block text-right text-[10px] ${m.autor === datos.soy ? "text-white/70" : "text-[#8A968F]"}`}>
                  {hora(m.created_at)}
                </span>
              </p>
            </div>
          )
        )}
        <div ref={fin} />
      </section>

      {/* Escribir */}
      {datos.abierto ? (
        <form
          onSubmit={enviar}
          className="sticky bottom-0 -mx-5 flex flex-col gap-1 border-t border-[#E3E3E3] bg-white/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
        >
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              placeholder="Escribe un mensaje…"
              aria-label="Mensaje"
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-[#E3E3E3] px-3 py-2.5 text-base outline-none focus:border-[#6D28D9]"
            />
            <button
              type="submit"
              disabled={!texto.trim() || enviando}
              className="boton-morado shrink-0 rounded-2xl px-4 py-2.5 font-bold text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
          <p className="text-[11px] text-[#8A968F]">No compartas contraseñas ni códigos de Yape por aquí.</p>
        </form>
      ) : (
        <p className="rounded-2xl bg-[#F4F4F4] p-3 text-center text-sm text-[#5A5A5A]">
          El chat se cerró 2 días después del partido. Puedes leer los mensajes, pero ya no escribir.
        </p>
      )}
    </div>
  );
}
