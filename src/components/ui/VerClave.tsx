"use client";

import { useState } from "react";

/**
 * Ojo para mostrar u ocultar una contraseña. Va dentro de un contenedor `relative`
 * junto al input (que necesita espacio a la derecha: `pr-12`).
 *   const ver = useVerClave();
 *   <div className="relative"><input type={ver.tipo} className="pr-12" /><BotonVerClave {...ver} /></div>
 */
export function useVerClave() {
  const [visible, setVisible] = useState(false);
  return { visible, tipo: visible ? "text" : "password", alternar: () => setVisible((v) => !v) };
}

export function BotonVerClave({ visible, alternar }: { visible: boolean; alternar: () => void }) {
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      aria-pressed={visible}
      title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-[#8A8A8A] outline-none hover:text-[#6D28D9] focus-visible:text-[#6D28D9] focus-visible:ring-2 focus-visible:ring-[#6D28D9]/30"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}
