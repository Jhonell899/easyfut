"use client";

import { cercania, distanciaKm, fmtDistancia, useMiUbicacion } from "@/lib/ubicacion";

/** "A 3,2 km de ti · Cerca de ti", o un botón para compartir la ubicación. */
export default function DistanciaCancha({ lat, lng }: { lat: number; lng: number }) {
  const { punto, estado, pedir } = useMiUbicacion();

  if (punto) {
    const km = distanciaKm(punto, { lat, lng });
    const c = cercania(km);
    return (
      <div className="flex items-center gap-2 border-t border-[#EFEFEF] px-4 py-3 text-sm">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.clase}`}>{c.texto}</span>
        <span className="text-[#1B1B1B]">
          A <strong>{fmtDistancia(km)}</strong> de ti
        </span>
        <span className="ml-auto text-xs text-[#8A968F]">en línea recta</span>
      </div>
    );
  }

  return (
    <div className="border-t border-[#EFEFEF] px-4 py-3">
      <button
        type="button"
        onClick={pedir}
        disabled={estado === "buscando" || estado === "no-soportado"}
        className="text-sm font-bold text-[#6D28D9] disabled:opacity-60"
      >
        {estado === "buscando" ? "Buscando tu ubicación…" : "¿Qué tan lejos estoy? Usar mi ubicación"}
      </button>
      {estado === "denegado" && (
        <p className="mt-1 text-xs text-[#5A5A5A]">
          Bloqueaste la ubicación. Actívala en el candado de la barra de direcciones.
        </p>
      )}
      {estado === "error" && <p className="mt-1 text-xs text-[#5A5A5A]">No pudimos obtener tu ubicación.</p>}
    </div>
  );
}
