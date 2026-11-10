"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Props = {
  codigo: string;
  canchaNombre: string;
  direccion: string;
  inicio: string; // ISO
  fin: string; // ISO
  cuando: string; // "sábado 15 de noviembre, 19:00 – 20:00"
  /** Pendiente, sin aviso de pago y sin vencer: el cliente aún puede cancelarla. */
  puedeCancelar: boolean;
  /** Pendiente o confirmada: tiene sentido guardarla en el calendario y compartirla. */
  activa: boolean;
};

/** 2026-11-15T00:00:00.000Z → 20261115T000000Z (formato de calendario) */
const fechaCal = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export default function AccionesReserva(p: Props) {
  const router = useRouter();
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const titulo = `Fútbol en ${p.canchaNombre}`;
  const lugar = `${p.direccion}, Lima, Perú`;
  const detalle = `Reserva EasyFut ${p.codigo}`;

  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titulo)}&dates=${fechaCal(p.inicio)}/${fechaCal(p.fin)}&details=${encodeURIComponent(detalle)}&location=${encodeURIComponent(lugar)}`;
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.canchaNombre}, ${lugar}`)}`;

  function descargarIcs() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//EasyFut//Reserva//ES",
      "BEGIN:VEVENT",
      `UID:${p.codigo}@easyfut`,
      `DTSTAMP:${fechaCal(new Date().toISOString())}`,
      `DTSTART:${fechaCal(p.inicio)}`,
      `DTEND:${fechaCal(p.fin)}`,
      `SUMMARY:${titulo}`,
      `LOCATION:${lugar.replace(/,/g, "\\,")}`,
      `DESCRIPTION:${detalle}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      "DESCRIPTION:Tu partido empieza en 1 hora",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `easyfut-${p.codigo}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function compartir() {
    const texto = `⚽ ¡Tenemos cancha! ${p.canchaNombre}, ${p.cuando}. ${p.direccion}.`;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url });
      } catch {}
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, "_blank", "noopener");
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(p.codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {}
  }

  async function cancelar() {
    if (!supabase) return;
    if (!confirm("¿Cancelar esta reserva? El horario quedará libre para otros jugadores.")) return;
    setCancelando(true);
    setError(null);
    const { error } = await supabase.rpc("cancelar_reserva", { p_codigo: p.codigo });
    setCancelando(false);
    if (error)
      return setError(
        /contacta_al_dueno/.test(error.message)
          ? "Esta reserva ya tiene un pago avisado o confirmado. Coordina la cancelación con el dueño."
          : /cancelar_reserva|does not exist|schema cache/i.test(error.message)
            ? "Falta ejecutar la migración 013 en Supabase."
            : "No pudimos cancelar la reserva. Inténtalo de nuevo."
      );
    router.refresh();
  }

  const boton = "flex flex-col items-center gap-1 rounded-xl bg-white p-3 text-center text-xs font-bold text-[#1B1B1B] shadow-sm hover:bg-[#FAFAFA]";

  return (
    <section className="flex flex-col gap-3">
      {p.activa && (
        <div className="grid grid-cols-4 gap-2">
          <a href={google} target="_blank" rel="noopener noreferrer" className={boton}>
            <Icono>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
            </Icono>
            Google Calendar
          </a>
          <button type="button" onClick={descargarIcs} className={boton}>
            <Icono>
              <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
            </Icono>
            Calendario
          </button>
          <button type="button" onClick={compartir} className={boton}>
            <Icono>
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="6" r="2.5" />
              <circle cx="18" cy="18" r="2.5" />
              <path d="M8.2 11l7.6-4M8.2 13l7.6 4" />
            </Icono>
            Compartir
          </button>
          <a href={mapa} target="_blank" rel="noopener noreferrer" className={boton}>
            <Icono>
              <path d="M3 11l18-8-8 18-2-8-8-2z" />
            </Icono>
            Cómo llegar
          </a>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={copiarCodigo} className="font-medium text-[#0B6E4F]">
          {copiado ? "¡Código copiado!" : `Copiar código ${p.codigo}`}
        </button>
        {p.puedeCancelar && (
          <button type="button" onClick={cancelar} disabled={cancelando} className="font-medium text-red-700 disabled:opacity-50">
            {cancelando ? "Cancelando…" : "Cancelar reserva"}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Icono({ children }: { children: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B6E4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
