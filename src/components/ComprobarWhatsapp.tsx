"use client";

import { useEffect, useState } from "react";

/**
 * Comprobación gratuita de WhatsApp: abre WhatsApp con el número y la persona
 * confirma que se abrió el chat (si el número no tiene WhatsApp, la app avisa
 * que no es válido). No verifica la propiedad del número: es una confirmación propia.
 */
export default function ComprobarWhatsapp({
  numero,
  confirmado,
  onCambio,
  ocupado = false,
}: {
  /** 9 dígitos; si no es válido el botón queda desactivado. */
  numero: string;
  confirmado: boolean;
  onCambio: (confirmado: boolean) => void;
  ocupado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const limpio = numero.replace(/\D/g, "");
  const valido = /^9\d{8}$/.test(limpio);

  // Si cambian el número, hay que volver a comprobar
  useEffect(() => setAbierto(false), [limpio]);

  if (confirmado) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#E6EEEA] px-3 py-2.5 text-sm text-[#0B6E4F]">
        <span className="font-bold">✓ +51 {limpio} tiene WhatsApp</span>
        <button type="button" onClick={() => onCambio(false)} className="text-xs text-[#5A5A5A] underline-offset-2 hover:underline">
          Cambiar
        </button>
      </div>
    );
  }

  if (abierto) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border-2 border-[#25D366] p-3 text-sm">
        <p className="font-bold">¿Se abrió el chat de WhatsApp con +51 {limpio}?</p>
        <p className="text-xs text-[#5A5A5A]">Si dice que el número no es válido, ese número no tiene WhatsApp.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="flex-1 rounded-lg border border-[#E3E3E3] py-2 font-bold"
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onCambio(true)}
            disabled={ocupado}
            className="flex-[2] rounded-lg bg-[#25D366] py-2 font-bold text-white disabled:opacity-50"
          >
            {ocupado ? "Guardando…" : "Sí, tiene WhatsApp"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <a
      href={valido ? `https://wa.me/51${limpio}` : undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => (valido ? setAbierto(true) : e.preventDefault())}
      aria-disabled={!valido}
      className={`flex items-center justify-center gap-2 rounded-xl border-2 border-[#25D366] py-2.5 text-sm font-bold text-[#128C4A] ${
        valido ? "hover:bg-[#F0FBF4]" : "pointer-events-none opacity-50"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
      </svg>
      Comprobar en WhatsApp
    </a>
  );
}
