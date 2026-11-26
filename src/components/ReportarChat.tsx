"use client";

import { useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

const MOTIVOS = [
  { clave: "acoso", texto: "Insultos o acoso" },
  { clave: "estafa", texto: "Estafa o me pide plata por fuera" },
  { clave: "spam", texto: "Spam o publicidad" },
  { clave: "otro", texto: "Otro motivo" },
] as const;

const ERRORES: Record<string, string> = {
  ya_reportado: "Ya reportaste este chat. El equipo de EasyFut lo está revisando.",
  demasiados_reportes: "Enviaste muchos reportes hoy. Inténtalo mañana o escríbenos a easyfutinquiries@gmail.com.",
  sin_permiso: "No participas en este chat.",
  motivo_invalido: "Elige un motivo.",
};

/** Botón y formulario para reportar un chat al equipo de EasyFut. */
export default function ReportarChat({ chatId }: { chatId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<string>("");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase || !motivo) return;
    setEnviando(true);
    const { error } = await supabase.rpc("reportar_chat", {
      p_chat: chatId,
      p_motivo: motivo,
      p_detalle: detalle.trim() || null,
    });
    setEnviando(false);
    if (error) {
      const clave = Object.keys(ERRORES).find((k) => error.message.includes(k));
      return setResultado({ ok: false, texto: clave ? ERRORES[clave] : "No se pudo enviar. Inténtalo de nuevo." });
    }
    setResultado({ ok: true, texto: "Gracias. El equipo de EasyFut revisará este chat. La otra persona no sabrá que lo reportaste." });
    setAbierto(false);
  }

  if (resultado?.ok)
    return <p className="rounded-xl bg-[#DCF5EA] p-3 text-xs font-medium text-[#0F7A55]">{resultado.texto}</p>;

  if (!abierto)
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="self-start text-xs font-bold text-red-700 underline-offset-2 hover:underline"
      >
        ⚑ Reportar este chat
      </button>
    );

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/50 p-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-bold text-[#1B1B1B]">¿Por qué lo reportas?</legend>
        {MOTIVOS.map((m) => (
          <label key={m.clave} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="motivo"
              value={m.clave}
              checked={motivo === m.clave}
              onChange={() => setMotivo(m.clave)}
              className="accent-[#6D28D9]"
            />
            {m.texto}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-bold">Cuéntanos más (opcional)</span>
        <textarea
          value={detalle}
          onChange={(e) => setDetalle(e.target.value.slice(0, 500))}
          rows={2}
          className="rounded-xl border border-[#E3E3E3] bg-white px-3 py-2 text-base outline-none focus:border-[#6D28D9]"
        />
      </label>
      {resultado && !resultado.ok && (
        <p role="alert" className="text-xs text-red-700">
          {resultado.texto}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!motivo || enviando}
          className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Enviar reporte"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="rounded-xl px-3 py-2 text-sm font-bold text-[#5A5A5A]">
          Cancelar
        </button>
      </div>
      <p className="text-[11px] text-[#5A5A5A]">
        El equipo de EasyFut podrá leer los mensajes de este chat para revisarlo.
      </p>
    </form>
  );
}
